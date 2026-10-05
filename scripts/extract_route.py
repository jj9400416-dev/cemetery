#!/usr/bin/env python3
"""Extract a hand-drawn route from a reference image into waypoints on the base map.

Usage:
  python extract_route.py BASE_MAP.jpg REFERENCE.png "Juan Dela Cruz" OUT.json [--overlay OVERLAY.jpg]

Needs: pip install opencv-python numpy scikit-image
The reference image may be a different crop/canvas size than the base map: it is
registered onto the base map (SIFT + RANSAC) before the line is read, so output
coordinates are always relative to the BASE map image (percent, 0-100).
Assumes the route is drawn in a saturated cyan/blue color (edit HSV range below if not).
"""
import sys, json, argparse
from collections import deque
import cv2, numpy as np
from skimage.morphology import skeletonize

ap = argparse.ArgumentParser()
ap.add_argument('base'); ap.add_argument('ref'); ap.add_argument('grave'); ap.add_argument('out')
ap.add_argument('--overlay'); ap.add_argument('--simplify', type=float, default=6.0)
a = ap.parse_args()

base = cv2.imread(a.base)
ref = cv2.imread(a.ref, cv2.IMREAD_UNCHANGED)[:, :, :3]
H, W = base.shape[:2]

# 1) isolate the drawn line (HSV range for the cyan/blue line)
mask = cv2.inRange(cv2.cvtColor(ref, cv2.COLOR_BGR2HSV), (90, 150, 150), (110, 255, 255))
mask = cv2.morphologyEx(mask, cv2.MORPH_CLOSE, np.ones((5, 5), np.uint8))
n, lab, stats, _ = cv2.connectedComponentsWithStats(mask)
keep = (lab == 1 + int(np.argmax(stats[1:, 4]))).astype(np.uint8) * 255  # largest blob = route

# 2) register reference -> base (route removed first so it doesn't bias matching)
clean = cv2.inpaint(ref, cv2.dilate(cv2.inRange(cv2.cvtColor(ref, cv2.COLOR_BGR2HSV), (90, 150, 150), (110, 255, 255)),
                                    np.ones((7, 7), np.uint8)), 5, cv2.INPAINT_TELEA)
sift = cv2.SIFT_create(6000)
k1, d1 = sift.detectAndCompute(cv2.cvtColor(base, cv2.COLOR_BGR2GRAY), None)
k2, d2 = sift.detectAndCompute(cv2.cvtColor(clean, cv2.COLOR_BGR2GRAY), None)
good = [m for m, n_ in cv2.BFMatcher().knnMatch(d2, d1, k=2) if m.distance < 0.75 * n_.distance]
src = np.float32([k2[m.queryIdx].pt for m in good]); dst = np.float32([k1[m.trainIdx].pt for m in good])
A, inl = cv2.estimateAffinePartial2D(src, dst, method=cv2.RANSAC, ransacReprojThreshold=4.0)
err = np.linalg.norm(cv2.transform(src[inl.ravel() == 1].reshape(-1, 1, 2), A).reshape(-1, 2) - dst[inl.ravel() == 1], axis=1)
print(f'registration: {int(inl.sum())} inliers, median error {np.median(err):.2f}px, scale {np.hypot(A[0,0],A[1,0]):.4f}')

# 3) skeleton -> longest path (drops spurs)
sk = skeletonize(keep > 0)
pts = set(zip(*[v.tolist() for v in np.nonzero(sk)[::-1]]))
def nb(p): return [(p[0]+dx, p[1]+dy) for dx in (-1, 0, 1) for dy in (-1, 0, 1) if (dx or dy) and (p[0]+dx, p[1]+dy) in pts]
def bfs(s):
    par = {s: None}; q = deque([s]); last = s
    while q:
        c = q.popleft(); last = c
        for m in nb(c):
            if m not in par: par[m] = c; q.append(m)
    return last, par
e1, _ = bfs(next(iter(pts))); e2, par = bfs(e1)
path = []; c = e2
while c is not None: path.append(c); c = par[c]
line = np.array(path[::-1], np.float32).reshape(-1, 1, 2)

# 4) simplify, map into base-map coordinates, output percent
simp = cv2.approxPolyDP(line, a.simplify, False)
tr = cv2.transform(simp, A).reshape(-1, 2)
# order: entrance -> grave (entrance = the end nearer the bottom-left of the map; edit if your entrances differ)
if tr[0][1] < tr[-1][1]: tr = tr[::-1]
out = {'grave': a.grave, 'imageSize': {'width': W, 'height': H},
       'waypoints': [{'x': round(float(x) / W * 100, 2), 'y': round(float(y) / H * 100, 2)} for x, y in tr]}
json.dump(out, open(a.out, 'w'), indent=2)
print(json.dumps(out['waypoints']))
if a.overlay:
    ov = base.copy(); cv2.polylines(ov, [tr.astype(np.int32).reshape(-1, 1, 2)], False, (0, 0, 255), 6)
    for x, y in tr: cv2.circle(ov, (int(x), int(y)), 12, (0, 255, 255), -1)
    cv2.imwrite(a.overlay, ov)
