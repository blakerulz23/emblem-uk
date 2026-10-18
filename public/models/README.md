# On-device models

`u2netp.onnx` — U²-Net (small, "u2netp") salient-object segmentation, used by
the card builder to lift the player off the photo background **in the
browser** (src/components/builder/emblem/bgRemovalOnDevice.ts). The photo
never leaves the device.

- Source: U²-Net, Qin et al. 2020 — https://github.com/xuebinqin/U-2-Net
  (Apache License 2.0), ONNX export as distributed by rembg
  (https://github.com/danielgatis/rembg, MIT) release v0.0.0.
- Input 1×3×320×320 (ImageNet mean/std), output d0 = 1×1×320×320 saliency.
