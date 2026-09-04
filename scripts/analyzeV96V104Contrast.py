import cv2
import numpy as np

videos = {
    'V96_top': r'outputs\deforum-merged-previews\androids_dream_VOC_V16_NO_DEVIATION_MORPH_CUDA_V96_12FPS_1080.mp4',
    'V108_blackbg': r'outputs\deforum-merged-previews\androids_dream_VOC_V16_NO_DEVIATION_MALE_TO_FEMALE_BLACKBG2_MORPH_CUDA_V108_12FPS_1080.mp4',
}

for name, path in videos.items():
    cap = cv2.VideoCapture(path)
    cap.set(cv2.CAP_PROP_POS_FRAMES, 180)
    ok, frame = cap.read()
    cap.release()
    if not ok:
        print(f'{name}: FAILED')
        continue
    h, w = frame.shape[:2]
    corner = frame[0:120, 0:120]          # background top-left
    center = frame[h//2-110:h//2+110, w//2-110:w//2+110]  # face region
    full = frame
    print(f'{name}:')
    print(f'  corner(bg) mean BGR = {tuple(int(x) for x in corner.reshape(-1,3).mean(0))}')
    print(f'  center(face) mean BGR = {tuple(int(x) for x in center.reshape(-1,3).mean(0))}')
    print(f'  full mean BGR = {tuple(int(x) for x in full.reshape(-1,3).mean(0))}')
    print(f'  full std = {float(full.reshape(-1,3).std()):.1f}')
