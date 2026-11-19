"""Turn a screen recording into a small set of still frames Claude can read.

Usage: python frames.py <recording> <output_dir> [max_frames]

Keeps frames where the screen changes (clicks, new pages, typing), plus one every
3 seconds while nothing changes, and caps the total
so long recordings stay readable. Prints one line per frame: file path and time.
"""
import json
import re
import shutil
import subprocess
import sys
from pathlib import Path


def run(args):
    return subprocess.run(args, capture_output=True, text=True, check=False)


def duration(video):
    probe = run(['ffprobe', '-v', 'error', '-show_entries', 'format=duration', '-of', 'json', str(video)])
    try:
        return float(json.loads(probe.stdout)['format']['duration'])
    except (KeyError, ValueError, json.JSONDecodeError):
        return 0.0


def extract(video, out, filter_graph):
    for old in out.glob('frame_*.png'):
        old.unlink()
    # showinfo logs each kept frame's real time, which we pair with the numbered files.
    result = run(['ffmpeg', '-hide_banner', '-i', str(video), '-vf', f'{filter_graph},showinfo', '-fps_mode', 'vfr',
                  str(out / 'frame_%04d.png')])
    if result.returncode != 0:
        sys.exit(f'ffmpeg failed: {result.stderr.strip()[-400:]}')
    times = [float(match) for match in re.findall(r'pts_time:\s*([\d.]+)', result.stderr)]
    frames = sorted(out.glob('frame_*.png'))
    return [(frame, times[index] if index < len(times) else 0.0) for index, frame in enumerate(frames)]


def main():
    if len(sys.argv) < 3:
        sys.exit(__doc__)
    if not shutil.which('ffmpeg') or not shutil.which('ffprobe'):
        sys.exit('ffmpeg is not installed. Install it (winget install Gyan.FFmpeg) or send screenshots instead.')
    video, out = Path(sys.argv[1]), Path(sys.argv[2])
    limit = int(sys.argv[3]) if len(sys.argv) > 3 else 40
    if not video.is_file():
        sys.exit(f'Recording not found: {video}')
    out.mkdir(parents=True, exist_ok=True)
    length = duration(video)
    # The first frame, any visible change (a cursor move or a small pop-up counts), and one every 3s while still.
    frames = extract(video, out, "select='isnan(prev_selected_t)+gt(scene,0.0005)*gte(t-prev_selected_t,0.5)+gte(t-prev_selected_t,3)',scale='min(1440,iw)':-2")
    # Always keep the final frame: the result of the last click (a download message, a saved page) is usually there.
    if length and (not frames or length - frames[-1][1] > 0.3):
        last = out / f'frame_{len(frames) + 1:04d}.png'
        # Decode the last 2 seconds and keep overwriting one image, which leaves the final frame.
        run(['ffmpeg', '-v', 'error', '-y', '-sseof', '-2', '-i', str(video), '-update', '1', '-vf', "scale='min(1440,iw)':-2", str(last)])
        if last.is_file():
            frames.append((last, length))
    if len(frames) > limit:
        keep = {round(i * (len(frames) - 1) / max(1, limit - 1)) for i in range(limit)}
        for index, (frame, _) in enumerate(frames):
            if index not in keep:
                frame.unlink()
        frames = [item for index, item in enumerate(frames) if index in keep]
    print(f'Recording: {video.name}, {length:.0f}s, {len(frames)} frames')
    for frame, seconds in frames:
        print(f'{frame}  @ {int(seconds // 60)}:{seconds % 60:04.1f}')


if __name__ == '__main__':
    main()
