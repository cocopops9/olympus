#!/usr/bin/env python3
"""Olympus: packs the coaches' natural voices (Kokoro-82M v1.0, int8, from sherpa-onnx's model
release) into one zip the app downloads (frontend/src/lib/local-voice.js, LocalVoicePlugin.java).

Only the voices the coaches use are kept: each one in kokoro-voices.json is a Kokoro voice or a
weighted mix of a few (Kokoro's style vectors average well), written into a voices.bin of its own,
and the model's metadata is told how many there are (sherpa-onnx checks the file against it).
That makes the voice table about 2 MB instead of 27 MB.

    python3 kokoro-pack.py <kokoro-int8-multi-lang-v1_0 dir> <kokoro-voices.json> <out dir>

Writes <out>/voice-kokoro.zip and <out>/kokoro.json (the "kokoro" entry of voices.json, without
the size and checksum, which the workflow adds).
"""
import json
import os
import shutil
import sys
import zipfile

import numpy as np
import onnx

STYLE_SHAPE = (510, 256)


def speaker_names(model):
    meta = {p.key: p.value for p in model.metadata_props}
    return meta['speaker_names'].split(',')


def mixed_voices(src_dir, config, names):
    """The voice table of the coaches: (array of shape (n, 510, 256), {lang: {who: {sid, speed}}})."""
    table = np.fromfile(os.path.join(src_dir, 'voices.bin'), dtype=np.float32)
    table = table.reshape(len(names), *STYLE_SHAPE)
    index = {name: i for i, name in enumerate(names)}
    rows, keys, langs = [], {}, {}
    for lang, entry in config['langs'].items():
        langs[lang] = {'espeak': entry['espeak'], 'who': {}}
        for who, voice in entry['who'].items():
            mix = voice['mix']
            total = sum(mix.values())
            if abs(total - 1.0) > 1e-6:
                raise ValueError(f'{lang}/{who}: the weights add up to {total}, not 1')
            key = json.dumps(sorted(mix.items()))
            if key not in keys:
                missing = [n for n in mix if n not in index]
                if missing:
                    raise ValueError(f'{lang}/{who}: no Kokoro voice named {missing}')
                keys[key] = len(rows)
                rows.append(sum(w * table[index[n]] for n, w in mix.items()))
            langs[lang]['who'][who] = {'sid': keys[key], 'speed': float(voice.get('speed', 1.0))}
    return np.stack(rows).astype(np.float32), langs


def with_speakers(model, count):
    """The model's metadata saying it has `count` speakers, named v0, v1, ..."""
    names = [f'v{i}' for i in range(count)]
    values = {
        'n_speakers': str(count),
        'speaker_names': ','.join(names),
        'id2speaker': ','.join(f'{i}->{n}' for i, n in enumerate(names)),
        'speaker2id': ','.join(f'{n}->{i}' for i, n in enumerate(names)),
    }
    for p in model.metadata_props:
        if p.key in values:
            p.value = values[p.key]
    return model


def main(src_dir, config_path, out_dir):
    config = json.load(open(config_path, encoding='utf-8'))
    model = onnx.load(os.path.join(src_dir, 'model.int8.onnx'))
    voices, langs = mixed_voices(src_dir, config, speaker_names(model))
    pack = os.path.join(out_dir, 'kokoro-pack')
    shutil.rmtree(pack, ignore_errors=True)
    os.makedirs(pack)
    onnx.save(with_speakers(model, len(voices)), os.path.join(pack, 'model.onnx'))
    voices.tofile(os.path.join(pack, 'voices.bin'))
    shutil.copy(os.path.join(src_dir, 'tokens.txt'), pack)
    shutil.copytree(os.path.join(src_dir, 'espeak-ng-data'), os.path.join(pack, 'espeak-ng-data'))
    # English is read with Kokoro's own word list, the other languages with espeak-ng.
    if any(v['espeak'].startswith('en') for v in langs.values()):
        shutil.copy(os.path.join(src_dir, 'lexicon-us-en.txt'), os.path.join(pack, 'lexicon-en.txt'))
    zpath = os.path.join(out_dir, 'voice-kokoro.zip')
    with zipfile.ZipFile(zpath, 'w', zipfile.ZIP_DEFLATED, compresslevel=9) as z:
        for root, _, files in os.walk(pack):
            for f in sorted(files):
                full = os.path.join(root, f)
                z.write(full, os.path.relpath(full, pack))
    entry = {'file': 'voice-kokoro.zip', 'name': 'kokoro-82m-v1.0-int8', 'langs': langs}
    json.dump(entry, open(os.path.join(out_dir, 'kokoro.json'), 'w'), indent=1)
    print(json.dumps(entry, indent=1))
    print(f'{len(voices)} voices, {os.path.getsize(zpath)} bytes')


if __name__ == '__main__':
    if len(sys.argv) != 4:
        sys.exit(__doc__)
    main(*sys.argv[1:])
