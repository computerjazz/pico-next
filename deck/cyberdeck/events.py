"""Semantic hardware events. Experiences never see raw keys for these."""
from dataclasses import dataclass


@dataclass(frozen=True)
class SliderChanged:
    index: int  # 0..4, left to right


@dataclass(frozen=True)
class LidChanged:
    open: bool
