"""Turn a screen recording into a readable timeline for Claude.

Usage: python frames.py <recording> <output_dir> [--max N] [--no-speech]

Writes to <output_dir>:
  frame_0001.png ...     the moments that matter (every visible change, plus one every 3s while still)
  frame_0001_marked.png  the same frame with a red box around what changed since the previous one
  frame_0001_zoom.png    a close-up of that changed area, so small text (menu items, buttons) is readable
  timeline.md            one row per frame: time, where on screen it changed, and what the user said then
  transcript.txt         everything the user said, with times (only if the recording has speech)

Needs ffmpeg. Optional: Pillow (boxes and close-ups) and faster-whisper (speech), both via
`pip install pillow faster-whisper`. Without them it still writes frames and the timeline.
"""
import json
import os
import re
import shutil
import subprocess
import sys
from pathlib import Path


def run(args):
    return subprocess.run(args, capture_output=True, text=True, encoding='utf-8', errors='replace', check=False)


def probe(video):
    result = run(['ffprobe', '-v', 'error', '-show_entries', 'format=duration:stream=codec_type', '-of', 'json', str(video)])
    try:
        info = json.loads(result.stdout)
        return float(info['format']['duration']), any(s.get('codec_type') == 'audio' for s in info.get('streams', []))
    except (KeyError, ValueError, json.JSONDecodeError):
        return 0.0, False


def stamp(seconds):
    return f'{int(seconds // 60)}:{seconds % 60:04.1f}'


def extract(video, out, filter_graph):
    # showinfo logs each kept frame's real time, which we pair with the numbered files.
    result = run(['ffmpeg', '-hide_banner', '-i', str(video), '-vf', f'{filter_graph},showinfo', '-fps_mode', 'vfr',
                  str(out / 'frame_%04d.png')])
    if result.returncode != 0:
        sys.exit(f'ffmpeg failed: {result.stderr.strip()[-400:]}')
    times = [float(match) for match in re.findall(r'pts_time:\s*([\d.]+)', result.stderr)]
    frames = sorted(out.glob('frame_[0-9][0-9][0-9][0-9].png'))
    return [(frame, times[index] if index < len(times) else 0.0) for index, frame in enumerate(frames)]


def area_name(box, width, height):
    left, top, right, bottom = box
    x, y = (left + right) / 2 / width, (top + bottom) / 2 / height
    vertical = 'top' if y < 0.33 else 'bottom' if y > 0.67 else 'middle'
    horizontal = 'left' if x < 0.33 else 'right' if x > 0.67 else 'centre'
    size = (right - left) * (bottom - top) / (width * height)
    scale = 'whole screen' if size > 0.6 else 'large area' if size > 0.15 else 'small area'
    return f'{scale}, {vertical} {horizontal}'


def mark_changes(frames):
    """Box what changed between consecutive frames and save a close-up of it. Returns a description per frame."""
    try:
        from PIL import Image, ImageChops, ImageDraw
    except ImportError:
        return {}
    notes = {}
    previous = None
    for frame, _ in frames:
        image = Image.open(frame).convert('RGB')
        if previous is None or previous.size != image.size:
            notes[frame] = 'first frame'
        else:
            # Ignore tiny compression noise; keep real changes such as a cursor, a highlight, or new text.
            diff = ImageChops.difference(previous, image).convert('L').point(lambda value: 255 if value > 28 else 0)
            box = diff.getbbox()
            if not box:
                notes[frame] = 'no visible change'
            else:
                pad = 40
                left, top = max(0, box[0] - pad), max(0, box[1] - pad)
                right, bottom = min(image.width, box[2] + pad), min(image.height, box[3] + pad)
                marked = image.copy()
                ImageDraw.Draw(marked).rectangle((left, top, right, bottom), outline=(230, 30, 30), width=4)
                marked.save(frame.with_name(f'{frame.stem}_marked.png'))
                zoom = image.crop((left, top, right, bottom))
                if zoom.width < 700:
                    factor = min(3, 700 / max(1, zoom.width))
                    zoom = zoom.resize((int(zoom.width * factor), int(zoom.height * factor)), Image.LANCZOS)
                zoom.save(frame.with_name(f'{frame.stem}_zoom.png'))
                notes[frame] = area_name((left, top, right, bottom), image.width, image.height)
        previous = image
    return notes


def transcribe(video, out):
    """Speech to text with timestamps, if faster-whisper is installed. Returns [(start, end, text)]."""
    try:
        from faster_whisper import WhisperModel
    except ImportError:
        print('Speech: skipped (install with: pip install faster-whisper)')
        return []
    audio = out / 'audio.wav'
    run(['ffmpeg', '-v', 'error', '-y', '-i', str(video), '-vn', '-ac', '1', '-ar', '16000', str(audio)])
    if not audio.is_file():
        return []
    try:
        model = WhisperModel('base', device='cpu', compute_type='int8')
        segments, _ = model.transcribe(str(audio), vad_filter=True)
        spoken = [(segment.start, segment.end, segment.text.strip()) for segment in segments if segment.text.strip()]
    except Exception as error:  # a missing model download or bad audio should not stop the frames
        print(f'Speech: could not transcribe ({error.__class__.__name__}: {str(error)[:120]})')
        return []
    finally:
        audio.unlink(missing_ok=True)
    (out / 'transcript.txt').write_text('\n'.join(f'[{stamp(s)}–{stamp(e)}] {t}' for s, e, t in spoken) + '\n', encoding='utf-8')
    return spoken


def main():
    argv = sys.argv[1:]
    limit = 40
    if '--max' in argv:
        position = argv.index('--max')
        limit = int(argv[position + 1])
        del argv[position:position + 2]
    args = [arg for arg in argv if not arg.startswith('--')]
    if len(args) < 2:
        sys.exit(__doc__)
    links = Path(os.environ.get('LOCALAPPDATA', '')) / 'Microsoft' / 'WinGet' / 'Links'
    if not shutil.which('ffmpeg') and (links / 'ffmpeg.exe').is_file():
        os.environ['PATH'] = f"{links}{os.pathsep}{os.environ['PATH']}"  # just installed; not on PATH until a new terminal
    if not shutil.which('ffmpeg') or not shutil.which('ffprobe'):
        sys.exit('ffmpeg is not installed. Run setup.py --install, or send screenshots instead.')
    video, out = Path(args[0]), Path(args[1])
    if not video.is_file():
        sys.exit(f'Recording not found: {video}')
    out.mkdir(parents=True, exist_ok=True)
    for old in out.glob('frame_*.png'):
        old.unlink()
    length, has_audio = probe(video)

    # The first frame, any visible change (a cursor move or a small pop-up counts), and one every 3s while still.
    frames = extract(video, out, "select='isnan(prev_selected_t)+gt(scene,0.0005)*gte(t-prev_selected_t,0.5)+gte(t-prev_selected_t,3)',scale='min(1440,iw)':-2")
    # Always keep the final frame: the result of the last click (a download message, a saved page) is usually there.
    if length and (not frames or length - frames[-1][1] > 0.3):
        last = out / f'frame_{len(frames) + 1:04d}.png'
        run(['ffmpeg', '-v', 'error', '-y', '-sseof', '-2', '-i', str(video), '-update', '1', '-vf', "scale='min(1440,iw)':-2", str(last)])
        if last.is_file():
            frames.append((last, length))
    if len(frames) > limit:
        keep = {round(i * (len(frames) - 1) / max(1, limit - 1)) for i in range(limit)}
        for index, (frame, _) in enumerate(frames):
            if index not in keep:
                frame.unlink()
        frames = [item for index, item in enumerate(frames) if index in keep]

    notes = mark_changes(frames)
    spoken = transcribe(video, out) if has_audio and '--no-speech' not in sys.argv else []

    rows = ['| # | Time | What changed on screen | Said around then | Files |', '| --- | --- | --- | --- | --- |']
    for index, (frame, seconds) in enumerate(frames, 1):
        next_time = frames[index][1] if index < len(frames) else length + 1
        said = ' '.join(text for start, _, text in spoken if seconds - 1 <= start < next_time)
        files = [frame.name] + [name for name in (f'{frame.stem}_marked.png', f'{frame.stem}_zoom.png') if (out / name).is_file()]
        rows.append(f'| {index} | {stamp(seconds)} | {notes.get(frame, "")} | {said} | {", ".join(files)} |')
    header = [f'# Recording timeline: {video.name}', '',
              f'Length {stamp(length)} · {len(frames)} key moments · speech: {"yes, see transcript.txt" if spoken else "none found" if has_audio else "no audio track"}', '']
    (out / 'timeline.md').write_text('\n'.join(header + rows) + '\n', encoding='utf-8')

    print(f'Recording: {video.name}, {length:.0f}s, {len(frames)} key moments, speech: {"yes" if spoken else "no"}')
    print(f'Read first: {out / "timeline.md"}')
    if spoken:
        print(f'Transcript: {out / "transcript.txt"}')


if __name__ == '__main__':
    main()
