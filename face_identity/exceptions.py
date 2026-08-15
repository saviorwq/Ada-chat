# -*- coding: utf-8 -*-
"""人脸 / 角色库自定义异常。Custom face & character-library errors."""


class FaceDetectNotFoundError(Exception):
    """图片中未检测到可用人脸。No usable face detected in image."""

    def __init__(self, message: str = "未检测到人脸") -> None:
        super().__init__(message)


class CharacterNotFoundError(Exception):
    """角色档案不存在。Character profile missing."""

    def __init__(self, cid: str) -> None:
        self.cid = cid
        super().__init__(f"角色不存在: {cid}")
