"""Olympus: the coaches' own voices, for the languages Kokoro does not speak.

For each language of .github/voices/coaches.json, the Piper voices of Hercules, Athena and
Calliope (Chiron reads with the language's own voice, voice-<lang>.zip) are packed in one zip,
voice-coaches-<lang>.zip: one folder per model (m1, m2, ...) with its model and tokens, and the
espeak-ng data they share. A coach may also read with the language's own voice, another speaker
of it (`"own": true`, with its `sid`), which costs nothing to download.

The models are made int8 (onnxruntime dynamic quantization): a quarter of the size (63 MB to
18 MB). Measured on German and Polish voices (2026-11-21): the int8 voice is heard as the same
speaker (speaker-embedding cosine 0.87 to 0.94 against the float one, where two different
speakers are 0.06 to 0.33) and as well understood (Whisper word errors within the 10 points two
takes of the same float voice differ by).

Writes <out>/voice-coaches-<lang>.zip and <out>/coaches.json:
  { lang: { file, models: [...], who: { hercules: { model: "m1", sid, speed, pitch } | { own: true, sid } } } }
Usage: coach-pack.py coaches.json base_url work_dir out_dir
"""
import json
import os
import shutil
import sys
import tarfile
import urllib.request
import zipfile

from onnxruntime.quantization import QuantType, quantize_dynamic

# Run with python -I (the script's folder is then not on the path): its neighbour by name.
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import piper_text  # noqa: E402


def fetch(base, name, work):
    """Unpacks the sherpa-onnx release of a Piper voice; the folder it is in."""
    archive = os.path.join(work, name + '.tar.bz2')
    urllib.request.urlretrieve(f'{base}/vits-piper-{name}.tar.bz2', archive)
    dest = os.path.join(work, 'x-' + name)
    shutil.rmtree(dest, ignore_errors=True)
    with tarfile.open(archive) as tar:
        tar.extractall(dest, filter='data')
    os.remove(archive)
    (inner,) = [os.path.join(dest, d) for d in os.listdir(dest)]
    return inner


def model_file(folder):
    (onnx_file,) = [f for f in os.listdir(folder) if f.endswith('.onnx')]
    return os.path.join(folder, onnx_file)


def pack(lang, voices, base, work, out):
    root = os.path.join(work, 'coaches-' + lang)
    shutil.rmtree(root, ignore_errors=True)
    os.makedirs(root)
    models, who = {}, {}
    for coach, v in voices.items():
        if v.get('own'):
            who[coach] = {'own': True, 'sid': int(v.get('sid', 0)), **({'pitch': v['pitch']} if 'pitch' in v else {})}
            continue
        name = v['voice']
        if name not in models:
            src = fetch(base, name, work)
            tag = 'm%d' % (len(models) + 1)
            dest = os.path.join(root, tag)
            os.makedirs(dest)
            model = os.path.join(dest, 'model.onnx')
            float_model = os.path.join(work, 'float.onnx')
            shutil.copy(model_file(src), float_model)
            piper_text.fix(float_model, model_file(src) + '.json', dest)
            quantize_dynamic(float_model, model, weight_type=QuantType.QUInt8)
            os.remove(float_model)
            shutil.copy(os.path.join(src, 'tokens.txt'), os.path.join(dest, 'tokens.txt'))
            if not os.path.isdir(os.path.join(root, 'espeak-ng-data')):
                shutil.copytree(os.path.join(src, 'espeak-ng-data'), os.path.join(root, 'espeak-ng-data'))
            shutil.rmtree(os.path.dirname(src))
            models[name] = tag
        entry = {'model': models[name], 'sid': int(v.get('sid', 0))}
        for key in ('speed', 'pitch'):
            if key in v:
                entry[key] = v[key]
        who[coach] = entry
    item = {'who': who, 'models': sorted(models, key=models.get)}
    if models:
        file = f'voice-coaches-{lang}.zip'
        with zipfile.ZipFile(os.path.join(out, file), 'w', zipfile.ZIP_DEFLATED, compresslevel=9) as z:
            for folder, _, files in os.walk(root):
                for f in files:
                    path = os.path.join(folder, f)
                    z.write(path, os.path.relpath(path, root))
        item['file'] = file
    shutil.rmtree(root)
    return item


def main(config, base, work, out):
    with open(config, encoding='utf-8') as f:
        langs = json.load(f)['langs']
    result = {}
    for lang, voices in langs.items():
        try:
            result[lang] = pack(lang, voices, base, work, out)
            print(lang, json.dumps(result[lang]), flush=True)
        except Exception as e:  # one language missing does not stop the others
            print(f'::warning::no coach voices for {lang}: {e}', flush=True)
    with open(os.path.join(out, 'coaches.json'), 'w', encoding='utf-8') as f:
        json.dump(result, f, indent=1)


if __name__ == '__main__':
    main(*sys.argv[1:5])
