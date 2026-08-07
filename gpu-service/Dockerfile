# GPU media service: NVENC-capable ffmpeg + Light-ASD.
#
# The base image matters more than it looks. A distro ffmpeg is almost never
# built with --enable-nvenc, so `-c:v h264_nvenc` fails at runtime with an
# unhelpful "Unknown encoder" — the CUDA runtime being present is not enough.
# jrottenberg/ffmpeg's nvidia variants are built with NVENC support against the
# matching CUDA version.
FROM jrottenberg/ffmpeg:6.1-nvidia2204 AS ffmpeg

FROM nvidia/cuda:12.1.1-cudnn8-runtime-ubuntu22.04

# Copy the NVENC-enabled ffmpeg/ffprobe binaries and their shared libraries.
COPY --from=ffmpeg /usr/local/bin/ffmpeg /usr/local/bin/ffmpeg
COPY --from=ffmpeg /usr/local/bin/ffprobe /usr/local/bin/ffprobe
COPY --from=ffmpeg /usr/local/lib /usr/local/lib
ENV LD_LIBRARY_PATH=/usr/local/lib:$LD_LIBRARY_PATH

RUN apt-get update && apt-get install -y --no-install-recommends \
      python3 python3-pip git libgl1 libglib2.0-0 fonts-dejavu-core \
    && rm -rf /var/lib/apt/lists/*

# Fonts used by burned-in captions must exist in the container, or libass
# silently substitutes and the GPU render looks different from the CPU one.
COPY fonts/ /usr/share/fonts/truetype/clipiro/
RUN fc-cache -f || true

WORKDIR /app

# torch pinned to the CUDA 12.1 wheels to match the base image.
RUN pip3 install --no-cache-dir \
      torch==2.3.1 torchvision==0.18.1 --index-url https://download.pytorch.org/whl/cu121 \
 && pip3 install --no-cache-dir \
      runpod==1.6.2 opencv-python-headless==4.10.0.84 scipy==1.13.1 \
      numpy==1.26.4 python_speech_features==0.6 scenedetect==0.6.4

# Light-ASD: TalkNet-ASD lineage, roughly an order of magnitude cheaper per
# frame, and it ships its own face detector + tracker so we get stable
# per-person track ids as well as speaking scores.
RUN git clone --depth 1 https://github.com/Junhua-Liao/Light-ASD.git /app/Light-ASD
COPY asd_model.py /app/asd_model.py
COPY handler.py /app/handler.py

# Model weights are baked into the image rather than downloaded at cold start:
# a scale-to-zero endpoint would otherwise re-download them on every cold boot.
COPY weights/ /app/weights/

ENV PYTHONUNBUFFERED=1
CMD ["python3", "-u", "handler.py"]
