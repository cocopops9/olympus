"""Olympus: Piper voices that read letters, not sounds.

A few Piper voices (uk_UA-ukrainian_tts) are trained on the letters of the text
("phoneme_type": "text" in their .onnx.json), but their model still says it reads espeak-ng
sounds ("has_espeak": "1"), so sherpa-onnx turns the text into sounds the model has no tokens for,
and it says nothing but a drawn-out "aaa" (heard and measured, 2026-11-21: Whisper heard "Аааа").
Such a model is told to read characters, and a file named `characters` beside it tells the app
(LocalVoicePlugin.java) to give it the text in lower case, with no espeak-ng data.
"""
import json
import os
import sys

import onnx


def reads_letters(model_json):
    try:
        with open(model_json, encoding='utf-8') as f:
            return json.load(f).get('phoneme_type') == 'text'
    except (OSError, ValueError):
        return False


def set_meta(model, key, value):
    for prop in model.metadata_props:
        if prop.key == key:
            prop.value = value
            return
    model.metadata_props.add(key=key, value=value)


def fix(model_path, model_json, marker_dir):
    """Rewrites `model_path` to read characters when its voice reads letters; True if it did."""
    if not reads_letters(model_json):
        return False
    model = onnx.load(model_path)
    for key, value in (('has_espeak', '0'), ('frontend', 'characters'), ('add_blank', '1')):
        set_meta(model, key, value)
    onnx.save(model, model_path)
    open(os.path.join(marker_dir, 'characters'), 'w').close()
    return True


if __name__ == '__main__':
    # piper_text.py model.onnx model.onnx.json dir
    print('characters' if fix(*sys.argv[1:4]) else 'sounds')
