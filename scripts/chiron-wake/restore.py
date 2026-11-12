# Restores the frames of the wake-up video before they are packed (video_sprite.py): the video
# is 480 px, compressed, and soft next to the portraits that open and close it, so each frame is
# upscaled four times by Real-ESRGAN (the x4plus_anime_6B model, made for drawn pictures: it
# sharpens lines and removes compression blocks without inventing texture), then brought back to
# the size the sheet needs. The network is the RRDBNet of Real-ESRGAN (Wang et al. 2021),
# written out here so nothing but torch is needed.
# Usage: python restore.py weights.pth frames_dir out_dir [size]
import glob, os, sys
import numpy as np
import torch
from torch import nn
from torch.nn import functional as F
from PIL import Image


class DenseBlock(nn.Module):
    def __init__(self, feat=64, grow=32):
        super().__init__()
        self.conv1 = nn.Conv2d(feat, grow, 3, 1, 1)
        self.conv2 = nn.Conv2d(feat + grow, grow, 3, 1, 1)
        self.conv3 = nn.Conv2d(feat + 2 * grow, grow, 3, 1, 1)
        self.conv4 = nn.Conv2d(feat + 3 * grow, grow, 3, 1, 1)
        self.conv5 = nn.Conv2d(feat + 4 * grow, feat, 3, 1, 1)
        self.lrelu = nn.LeakyReLU(0.2, inplace=True)

    def forward(self, x):
        x1 = self.lrelu(self.conv1(x))
        x2 = self.lrelu(self.conv2(torch.cat((x, x1), 1)))
        x3 = self.lrelu(self.conv3(torch.cat((x, x1, x2), 1)))
        x4 = self.lrelu(self.conv4(torch.cat((x, x1, x2, x3), 1)))
        x5 = self.conv5(torch.cat((x, x1, x2, x3, x4), 1))
        return x5 * 0.2 + x


class RRDB(nn.Module):
    def __init__(self, feat, grow):
        super().__init__()
        self.rdb1 = DenseBlock(feat, grow)
        self.rdb2 = DenseBlock(feat, grow)
        self.rdb3 = DenseBlock(feat, grow)

    def forward(self, x):
        return self.rdb3(self.rdb2(self.rdb1(x))) * 0.2 + x


class RRDBNet(nn.Module):
    def __init__(self, blocks=6, feat=64, grow=32):
        super().__init__()
        self.conv_first = nn.Conv2d(3, feat, 3, 1, 1)
        self.body = nn.Sequential(*[RRDB(feat, grow) for _ in range(blocks)])
        self.conv_body = nn.Conv2d(feat, feat, 3, 1, 1)
        self.conv_up1 = nn.Conv2d(feat, feat, 3, 1, 1)
        self.conv_up2 = nn.Conv2d(feat, feat, 3, 1, 1)
        self.conv_hr = nn.Conv2d(feat, feat, 3, 1, 1)
        self.conv_last = nn.Conv2d(feat, 3, 3, 1, 1)
        self.lrelu = nn.LeakyReLU(0.2, inplace=True)

    def forward(self, x):
        feat = self.conv_first(x)
        feat = feat + self.conv_body(self.body(feat))
        feat = self.lrelu(self.conv_up1(F.interpolate(feat, scale_factor=2, mode='nearest')))
        feat = self.lrelu(self.conv_up2(F.interpolate(feat, scale_factor=2, mode='nearest')))
        return self.conv_last(self.lrelu(self.conv_hr(feat)))


def main():
    weights, src, dst = sys.argv[1:4]
    size = int(sys.argv[4]) if len(sys.argv) > 4 else 960
    net = RRDBNet()
    # weights_only: the file is read as tensors only, never as code.
    state = torch.load(weights, map_location='cpu', weights_only=True)
    net.load_state_dict(state.get('params_ema') or state.get('params') or state, strict=True)
    net.eval()
    os.makedirs(dst, exist_ok=True)
    for f in sorted(glob.glob(os.path.join(src, '*.png'))):
        rgb = np.asarray(Image.open(f).convert('RGB'), np.float32) / 255
        x = torch.from_numpy(rgb.transpose(2, 0, 1))[None]
        with torch.no_grad():
            y = net(x).clamp(0, 1)[0].numpy().transpose(1, 2, 0)
        out = Image.fromarray((y * 255 + 0.5).astype(np.uint8)).resize((size, size), Image.LANCZOS)
        out.save(os.path.join(dst, os.path.basename(f)))
        print(os.path.basename(f), flush=True)


if __name__ == '__main__':
    main()
