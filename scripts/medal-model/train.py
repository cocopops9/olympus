#!/usr/bin/env python3
"""
The model behind the personal strength medals (api/medal-model.js): how much a lifter's z score
(frontend/src/lib/strength-level.js: strength against lifters of the same sex, age and body weight)
rises after 6, 16, 40, 80 and 156 weeks, from where they started.

Data: OpenPowerlifting (public domain), the 1.42 M meet entries up to 2019-04-20 of the snapshot
mirrored at github.com/shperry03/PowerAI (openpowerlifting.csv, sha256 1e9a5259...). Raw lifting
only (knee wraps allowed on bench and deadlift). For every lifter and lift, each later meet is
paired with the first one: the gain of z against the years between them.

What it cannot tell: competitors are not typical gym members (they are stronger, z median 1.4,
and few start below z = 0); the first meet is not the first day of training; lifters who keep
competing are the ones who keep improving (survivorship); no habits (sessions a week) are known;
only squat, bench press and deadlift are measured.

Model: LightGBM median regression on sex, lift, age, body weight ratio, starting z and years,
each lifter weighted once; parameters chosen on an inner split of the training lifters; checked
on 20 % of lifters held out. The 6 and 16 week gains are read from a hyperbola fitted through
zero and the 40, 80 and 156 week gains (meets so close together are rare and noisy).

Ordinary people (since 2026-11-27): FAMuSS (Thompson et al. 2004; the full data as kept by the
openintro R package, data-raw/famuss/famuss.Rdata): about 1000 untrained adults of 17 to 41, 12
weeks of supervised training of the non-dominant elbow flexors, 1RM before and after. It measures
what the meets cannot: the first months of people who never trained. Its 12-week gain (median
LightGBM on sex, age, body weight, starting z) sets the short horizons for profiles inside its
range of starting z; the meets keep the long horizons and everyone outside that range. Its limits:
one isolation exercise, one-arm dumbbell maxima taken as half a barbell curl (assumption), the gain
of z assumed to carry across exercises (as the app already assumes), ages 17 to 41 only (older
ages scaled by the meets' own age effect), 12 weeks only.

  pip install pandas numpy lightgbm pyreadr
  python3 scripts/medal-model/train.py openpowerlifting.csv api/medal-model-data.js famuss.Rdata
"""
import sys, json, itertools
import pandas as pd, numpy as np, lightgbm as lgb
OUT = sys.argv[2]
FAMUSS = sys.argv[3] if len(sys.argv) > 3 else None
# Builds (first meet, later meet) pairs per lifter and lift, with the app's z score.
cols=['Name','Sex','Event','Equipment','Age','BodyweightKg','Best3SquatKg','Best3BenchKg','Best3DeadliftKg','Date']
df=pd.read_csv(sys.argv[1],usecols=cols,low_memory=False)
df=df[df.Sex.isin(['M','F'])&df.BodyweightKg.notna()&(df.BodyweightKg>30)&(df.BodyweightKg<200)]
df['Date']=pd.to_datetime(df.Date,errors='coerce'); df=df[df.Date.notna()]
df['t']=df.Date.dt.year+df.Date.dt.dayofyear/365.25
# Birth year estimate per lifter from every meet with an age; lifters with inconsistent ages are dropped.
a=df[df.Age.notna()].copy(); a['by']=a.t-a.Age-0.5
g=a.groupby(['Name','Sex']).by.agg(['median','std','count'])
g=g[(g['std'].fillna(0)<1.5)]
df=df.merge(g[['median']].rename(columns={'median':'by'}),left_on=['Name','Sex'],right_index=True)
df['age']=df.t-df.by
df=df[(df.age>=14)&(df.age<=85)]
# App's strength model (frontend/src/lib/strength-level.js).
ANCH={'squat':{'M':(1.25,2.5),'F':(0.9,1.9)},'bench':{'M':(1.0,2.0),'F':(0.6,1.25)},'deadlift':{'M':(1.5,3.0),'F':(1.1,2.3)}}
CI,CE=-0.5244,1.96
REF={'M':80,'F':62}
AGE=[[14,0.78],[16,0.86],[18,0.93],[20,0.97],[23,1],[35,1],[40,0.97],[45,0.93],[50,0.88],[55,0.83],[60,0.77],[65,0.71],[70,0.65],[75,0.58],[80,0.52]]
ax=np.array([x for x,_ in AGE]); ay=np.array([y for _,y in AGE])
def agef(age): return np.interp(age,ax,ay)
def z(lift,sex,v,bw,age):
    lo=np.where(sex=='F',ANCH[lift]['F'][0],ANCH[lift]['M'][0]); hi=np.where(sex=='F',ANCH[lift]['F'][1],ANCH[lift]['M'][1])
    s=(np.log(hi)-np.log(lo))/(CE-CI); mu0=np.log(lo)-CI*s
    ref=np.where(sex=='F',62,80)
    mu=mu0+np.log(agef(age))-np.log(bw/ref)/3
    return (np.log(v/bw)-mu)/s, s
out=[]
for lift,col,eq in [('squat','Best3SquatKg',['Raw']),('bench','Best3BenchKg',['Raw','Wraps']),('deadlift','Best3DeadliftKg',['Raw','Wraps'])]:
    d=df[df.Equipment.isin(eq)&df[col].notna()&(df[col]>0)].copy()
    d['v']=d[col]
    d['z'],d['sigma']=z(lift,d.Sex.values,d.v.values,d.BodyweightKg.values,d.age.values)
    # One entry per lifter per day (best).
    d=d.sort_values('v').drop_duplicates(['Name','Sex','Date'],keep='last').sort_values(['Name','Sex','t'])
    first=d.groupby(['Name','Sex']).head(1)
    n=d.groupby(['Name','Sex']).size()
    keys=n[n>=2].index
    d=d.set_index(['Name','Sex']).loc[keys].reset_index()
    f=d.groupby(['Name','Sex']).first()[['t','z','v','BodyweightKg','age']].add_suffix('0')
    d=d.merge(f,left_on=['Name','Sex'],right_index=True)
    d['nmeets']=d.groupby(['Name','Sex']).cumcount()   # meets since the first
    d=d[d.t>d.t0+0.02]
    d['dt']=d.t-d.t0
    # Drop entries with implausible body weight change (name collisions).
    d=d[(d.BodyweightKg/d.BodyweightKg0).between(0.75,1.33)]
    d['dz']=d.z-d.z0
    d['lift']=lift
    out.append(d[['Name','Sex','lift','t0','dt','age0','BodyweightKg0','z0','v0','v','z','dz','sigma','nmeets','BodyweightKg']])
    print(lift,'lifters',len(keys),'pairs',len(d))
P=pd.concat(out)

P=P[P.dt<=8].copy()
P['sexF']=(P.Sex=='F').astype(int)
P['liftc']=P.lift.map({'squat':0,'bench':1,'deadlift':2})
REF=np.where(P.sexF==1,62,80); P['bwr']=P.BodyweightKg0/REF
feats=['sexF','liftc','age0','bwr','z0','dt']
rng=np.random.default_rng(7)
ids=(P.Name+'|'+P.Sex).unique(); hold=set(rng.choice(ids,size=len(ids)//5,replace=False))
P['hold']=(P.Name+'|'+P.Sex).isin(hold)
tr,te=P[~P.hold],P[P.hold]
print('train pairs',len(tr),'holdout pairs',len(te),'holdout lifters',len(hold))
# Weight each lifter equally overall (a lifter with 20 meets must not dominate).
w=1/tr.groupby(['Name','Sex','lift']).dz.transform('size')
params=dict(objective='quantile',alpha=0.5,learning_rate=0.05,num_leaves=31,min_data_in_leaf=100,feature_fraction=0.9,bagging_fraction=0.8,bagging_freq=1,
            verbose=-1,seed=7)
m=lgb.train(params,lgb.Dataset(tr[feats],tr.dz,weight=w,categorical_feature=['liftc']),num_boost_round=210)
te=te.copy(); te['pred']=m.predict(te[feats])
def curve(t): return -1+3*np.maximum(t,0)/(np.maximum(t,0)+0.75)
def tau(z):
    u=np.clip((z+1)/3,0,0.999); return np.where(z<=-1,0,0.75*u/(1-u))
te['hand']=np.maximum(curve(tau(te.z0)+te.dt)-curve(tau(te.z0)),0.045*np.sqrt(te.dt)/te.sigma)
# Baseline: median by z0 band x time band (a plain lookup).
for d in (tr,te):
    d['zb']=pd.cut(d.z0,[-9,-0.5,0,0.5,1,1.5,2,2.5,9]); d['tb']=pd.cut(d.dt,[0,0.25,0.5,1,2,3,5,8])
look=tr.groupby(['zb','tb'],observed=True).dz.median()
te['look']=[look.get((a,b),0) for a,b in zip(te.zb,te.tb)]
wt=1/te.groupby(['Name','Sex','lift']).dz.transform('size')
mae=lambda c: np.average(np.abs(te.dz-te[c]),weights=wt)
res={c:round(mae(c),4) for c in ['pred','look','hand']}; res['zero']=round(np.average(np.abs(te.dz),weights=wt),4)
print('holdout weighted MAE',res)
below=np.average(te.dz<te.pred,weights=wt); print('share below median overall',round(below,3))
te['ab']=pd.cut(te.age0,[0,30,45,99]); te['zq']=pd.cut(te.z0,[-9,0.5,1.5,2.2,9])
cell=te.assign(w=wt,b=(te.dz<te.pred)).groupby(['Sex','lift','zq','ab'],observed=True).apply(lambda g: pd.Series({'n':len(g),'below':np.average(g.b,weights=g.w)}),include_groups=False)
cell=cell[cell.n>=200]; print('cells',len(cell),'worst',round((cell.below-0.5).abs().max(),3)); print(cell.sort_values('below').iloc[[0,1,-2,-1]])
imp=dict(zip(feats,m.feature_importance('gain'))); print({k:round(v/sum(imp.values()),3) for k,v in imp.items()})
print('cells outside 0.5+-0.08:', int(((cell.below-0.5).abs()>0.08).sum()), 'of', len(cell))
# ---- Ordinary people: FAMuSS (see the docstring) ----
CURL={'M':(0.4,0.85),'F':(0.22,0.5)}   # the app's barbell curl norms (lib/strength-level.js)
def famuss():
    import pyreadr
    f=list(pyreadr.read_r(FAMUSS).values())[0]
    d=f[['id','Gender','Age','Pre.weight','Pre_NDRM_Max','Post_NDRM_Max']].copy()
    for c in d.columns[2:]: d[c]=pd.to_numeric(d[c],errors='coerce')
    d=d.dropna(); d=d[(d.Pre_NDRM_Max>0)&(d.Post_NDRM_Max>0)]
    d['sexF']=d.Gender.astype(str).str.startswith('F').astype(int)
    sx=np.where(d.sexF==1,'F','M'); bw=d['Pre.weight'].values*0.45359237
    lo=np.array([CURL[x][0] for x in sx]); hi=np.array([CURL[x][1] for x in sx])
    s=(np.log(hi)-np.log(lo))/(CE-CI); mu=np.log(lo)-CI*s+np.log(agef(d.Age.values))-np.log(bw/np.where(d.sexF==1,62,80))/3
    # One-arm dumbbell maximum, in pounds: a barbell curl taken as twice it (assumption).
    d['z0']=(np.log(2*d.Pre_NDRM_Max.values*0.45359237/bw)-mu)/s
    d['dz']=np.log(d.Post_NDRM_Max/d.Pre_NDRM_Max)/s
    d['age0']=d.Age; d['bwr']=bw/np.where(d.sexF==1,62,80)
    r=np.random.default_rng(7); d['hold']=r.random(len(d))<0.2
    return d.reset_index(drop=True)
FF=['sexF','age0','bwr','z0']
FP=dict(objective='quantile',alpha=0.5,learning_rate=0.05,num_leaves=7,min_data_in_leaf=40,verbose=-1,seed=7)
if FAMUSS:
    FD=famuss(); ftr=FD[~FD.hold]
    fm=lgb.train(FP,lgb.Dataset(ftr[FF],ftr.dz),num_boost_round=150)
    # Its range of starting z, per sex: full weight between the 5th and 95th centiles, none a
    # whole z beyond (the trees would only repeat the edge there).
    FR={sx:tuple(np.quantile(ftr[ftr.sexF==sx].z0,[0.05,0.95])) for sx in (0,1)}
    print('FAMuSS train',len(ftr),'holdout',int(FD.hold.sum()),'z0 range',{k:tuple(round(x,2) for x in v) for k,v in FR.items()})
def famuss_weight(sx,z):
    a,b=FR[sx]; return float(np.clip(1-max(a-z,z-b,0),0,1))
def famuss_g12(si,age,bwr,z,g40_by_age):
    """The ordinary people's median 12-week gain. Ages past 41 (the oldest in FAMuSS): the gain at
    41 scaled by the meets' own 40-week age effect, kept within 0.5 to 1.2."""
    g=float(fm.predict(pd.DataFrame([[si,min(max(age,17),41),bwr,z]],columns=FF))[0])
    if age>41:
        ref=np.interp(41,AG,g40_by_age)
        if ref>0: g*=float(np.clip(np.interp(age,AG,g40_by_age)/ref,0.5,1.2))
    return max(g,0.0)
def famuss_check(arr,AG,BW,Z):
    """Held-out ordinary people: the 12-week gain read from the exported grid (as the app reads
    it), against the grid without them and against the app's curve."""
    te=FD[FD.hold]
    def grid12(a):
        out=[]
        for _,r in te.iterrows():
            pts=[(AG,r.age0),(BW,r.bwr),(Z,r.z0)]; g=0
            idx=[];
            for ax,x in pts:
                x=min(max(x,ax[0]),ax[-1]); i=max(0,min(len(ax)-2,int(np.searchsorted(ax,x))-1)); f=(x-ax[i])/(ax[i+1]-ax[i]); idx.append((i,f))
            for da,db,dz in itertools.product((0,1),(0,1),(0,1)):
                wgt=(idx[0][1] if da else 1-idx[0][1])*(idx[1][1] if db else 1-idx[1][1])*(idx[2][1] if dz else 1-idx[2][1])
                h=a[int(r.sexF),1,idx[0][0]+da,idx[1][0]+db,idx[2][0]+dz]
                g+=wgt*(h[0]+(h[1]-h[0])*(12-6)/(16-6))
            out.append(g)
        return np.array(out)
    p_new=grid12(arr); p_old=grid12(ARR_OPL)
    t=np.clip(te.z0.values,-1,1.999); u=(t+1)/3; tau=np.where(te.z0<=-1,0,0.75*u/(1-u))
    p_hand=np.maximum(curve(tau+12/52)-curve(tau),0.045*np.sqrt(12/52)/0.3)
    mae=lambda p: round(float(np.mean(np.abs(te.dz-p))),4)
    r={'combined':mae(p_new),'meets only':mae(p_old),'hand curve':mae(p_hand),'zero':mae(0),'below':round(float(np.mean(te.dz<p_new)),3)}
    print('FAMuSS holdout 12-week MAE (and share below the combined median)', r)
    return r
# Export: the model's median gain at the medal horizons on a grid, for the server.
H=[6/52,16/52,40/52,80/52,156/52]
AG=[16,20,25,30,40,50,60,70]; BW=[0.7,0.85,1.0,1.2,1.45]; Z=[round(-2+0.5*i,1) for i in range(12)]
import itertools
rows=[]
for s,l,a,bw,z in itertools.product([0,1],[0,1,2],AG,BW,Z):
    for h in H: rows.append((s,l,a,bw,z,h))
G=pd.DataFrame(rows,columns=feats); G['p']=m.predict(G[feats])
arr=G.p.values.reshape(2,3,len(AG),len(BW),len(Z),len(H))
arr=np.maximum.accumulate(np.maximum(arr,0),axis=-1)   # gains never shrink with time
# Meets closer than a few months apart are rare and carry first-meet nerves and peaking, so the
# short horizons are not read from the trees: g(t) = A t / (t + h), through zero at the start,
# is fitted to the 40, 80 and 156 week gains of each profile and gives the 6 and 16 week ones.
def short_horizons(arr):
    t3=np.array(H[2:]); hs=np.linspace(0.05,6,240)
    flat=arr.copy().reshape(-1,len(H))
    for i in range(len(flat)):
        y=flat[i,2:]; best=None
        for h in hs:
            f=t3/(t3+h); A=max(0,(f@y)/(f@f)); e=((A*f-y)**2).sum()
            if best is None or e<best[0]: best=(e,A,h)
        _,A,h=best
        flat[i,0]=A*H[0]/(H[0]+h); flat[i,1]=A*H[1]/(H[1]+h)
    return np.maximum.accumulate(flat.reshape(arr.shape),axis=-1)
ARR_OPL=short_horizons(arr)
W=np.array([6,16,40,80,156])
def opl_gain(si,li,ai,bi,z,weeks):
    """The meets' gain from starting z `z` over `weeks`, read off the grid (linear in z and weeks)."""
    if weeks<=0: return 0.0
    z=min(max(z,Z[0]),Z[-1]); g=np.array([np.interp(z,Z,ARR_OPL[si,li,ai,bi,:,k]) for k in range(len(W))])
    return float(np.interp(weeks,np.r_[0,W],np.r_[0,g]))
# Ordinary people: inside FAMuSS's range, the first 12 weeks are theirs, and what follows is the
# meets' gain from where those 12 weeks left them (the gain to come depends on the level reached,
# as the meets' model already assumes); 6 weeks is read off the app's curve shape (assumption:
# a hyperbola with a half-time of 0.75 years, so 57 % of the 12-week gain).
SIX=(6/(6+39))/(12/(12+39))
def with_ordinary_people(base):
    out=base.copy()
    for si,li,ai,bi,zi in itertools.product(range(2),range(3),range(len(AG)),range(len(BW)),range(len(Z))):
        w=famuss_weight(si,Z[zi])
        if w<=0: continue
        g12=famuss_g12(si,AG[ai],BW[bi],Z[zi],base[si,li,:,bi,zi,2])
        chain=[SIX*g12]+[g12+opl_gain(si,li,ai,bi,Z[zi]+g12,h-12) for h in W[1:]]
        out[si,li,ai,bi,zi]=w*np.array(chain)+(1-w)*base[si,li,ai,bi,zi]
    return np.maximum.accumulate(out,axis=-1)
arr=with_ordinary_people(ARR_OPL) if FAMUSS else ARR_OPL
FCHECK=famuss_check(arr,AG,BW,Z) if FAMUSS else None
out={'source':'OpenPowerlifting snapshot to 2019-04-20 (raw/wraps, public domain), LightGBM median regression of z gain since first meet'+('; short horizons of untrained people from FAMuSS (12 weeks, n~1000)' if FAMUSS else ''),
     'holdout':res,**({'holdoutFamuss':FCHECK} if FAMUSS else {}),'axes':{'sex':['male','female'],'lift':['squat','bench','deadlift'],'age':AG,'bwRatio':BW,'z0':Z,'weeks':[6,16,40,80,156]},
     'gain':np.round(arr,3).tolist()}
open(OUT,'w').write('// Generated by scripts/medal-model/train.py from OpenPowerlifting'+(' and FAMuSS' if FAMUSS else '')+' data. Do not edit by hand.\n'
  '// The median gain of z (lib/strength-level.js units) after 6, 16, 40, 80 and 156 weeks, on a grid\n'
  '// of sex x lift x age x body weight (against 80 kg men, 62 kg women) x starting z.\n'
  'export const MEDAL_MODEL = '+json.dumps(out,separators=(',',':'))+';\n')
print('grid size', arr.size)
# Gains at the horizons for a few profiles (ln % on the bar = gain*sigma).
for name,s,l,a,bw,z in [('M35 bench z0=0',0,1,35,1,0),('F58 bench z0=-0.5',1,1,58,0.8,-0.5),('M28 pro bench z0=2.5',0,1,28,1.3,2.5),('M70 squat z0=0',0,0,70,0.95,0)]:
    print(name, arr[s,l,AG.index(min(AG,key=lambda x:abs(x-a))),BW.index(min(BW,key=lambda x:abs(x-bw))),Z.index(z)].round(3))
