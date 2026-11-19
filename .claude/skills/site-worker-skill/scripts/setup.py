"""Check (and, with --install, install) what site-worker-skill needs.

Usage:
  python setup.py            check only, print a plain-English status
  python setup.py --install  install anything missing, then check again

Needs:     ffmpeg (reads videos)
Nice to have: Pillow (close-ups of what was clicked), faster-whisper (understands what the user says)
Last line printed is one of: READY, READY_BASIC (works without speech/close-ups), or MISSING_FFMPEG.
"""
import importlib.util
import os
import platform
import shutil
import subprocess
import sys
from pathlib import Path


def find_ffmpeg():
    """ffmpeg on PATH, or in winget's links folder (a fresh install isn't on PATH until a new terminal)."""
    if shutil.which('ffmpeg') and shutil.which('ffprobe'):
        return True
    links = Path(os.environ.get('LOCALAPPDATA', '')) / 'Microsoft' / 'WinGet' / 'Links'
    if (links / 'ffmpeg.exe').is_file():
        os.environ['PATH'] = f"{links}{os.pathsep}{os.environ['PATH']}"
        return bool(shutil.which('ffprobe'))
    return False


def has_module(name):
    return importlib.util.find_spec(name) is not None


def status():
    return {'ffmpeg': find_ffmpeg(), 'pillow': has_module('PIL'), 'faster-whisper': has_module('faster_whisper')}


def install(missing):
    system = platform.system()
    if 'ffmpeg' in missing:
        if system == 'Windows' and shutil.which('winget'):
            command = ['winget', 'install', '--id', 'Gyan.FFmpeg', '-e', '--accept-source-agreements', '--accept-package-agreements', '--silent']
        elif system == 'Darwin' and shutil.which('brew'):
            command = ['brew', 'install', 'ffmpeg']
        else:
            command = None
            print('Video tool (ffmpeg): please install it from https://ffmpeg.org/download.html, then try again.')
        if command:
            print('Installing the video tool (ffmpeg). This can take a few minutes...')
            subprocess.run(command, check=False)
    packages = [name for name in ('pillow', 'faster-whisper') if name in missing]
    if packages:
        print(f'Installing {", ".join(packages)}...')
        subprocess.run([sys.executable, '-m', 'pip', 'install', '--user', '--quiet', *packages], check=False)


def main():
    found = status()
    missing = [name for name, ok in found.items() if not ok]
    if missing and '--install' in sys.argv:
        install(missing)
        importlib.invalidate_caches()
        found = status()
    labels = {
        'ffmpeg': 'Video tool (ffmpeg): reads your screen recordings',
        'pillow': 'Close-ups (Pillow): zooms in on what you clicked',
        'faster-whisper': 'Speech (faster-whisper): understands what you say in the video',
    }
    for name, ok in found.items():
        print(f"{'OK     ' if ok else 'MISSING'}  {labels[name]}")
    if not found['ffmpeg']:
        print('MISSING_FFMPEG')
    elif all(found.values()):
        print('READY')
    else:
        print('READY_BASIC')


if __name__ == '__main__':
    main()
