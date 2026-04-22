#!/usr/bin/env python3
"""
从 Chrome 导出仅 YouTube/Google 域名的 cookies，生成 Netscape 格式 cookies.txt。
只读取视频下载所需的域名，不碰其他网站。
"""

import sys
import os
import sqlite3
import shutil
import tempfile
import struct
import subprocess
import time

YOUTUBE_DOMAINS = [
    ".youtube.com",
    ".youtu.be",
    ".google.com",
    ".googleapis.com",
    ".accounts.google.com",
]

def get_chrome_cookies_db():
    path = os.path.expanduser("~/Library/Application Support/Google/Chrome/Default/Cookies")
    if not os.path.exists(path):
        path = os.path.expanduser("~/Library/Application Support/Google/Chrome/Profile 1/Cookies")
    if not os.path.exists(path):
        raise FileNotFoundError("找不到 Chrome cookies 数据库，请确认已安装 Chrome")
    return path

def get_encryption_key():
    result = subprocess.run(
        ["security", "find-generic-password", "-s", "Chrome Safe Storage", "-w"],
        capture_output=True, text=True
    )
    if result.returncode != 0:
        raise RuntimeError("无法获取 Chrome 加密密钥（密钥串访问被拒绝）")
    return result.stdout.strip()

def derive_key(password):
    import hashlib
    key = hashlib.pbkdf2_hmac("sha1", password.encode("utf-8"), b"saltysalt", 1003, dklen=16)
    return key

def decrypt_cookie_value(encrypted_value, key):
    if not encrypted_value:
        return ""
    if encrypted_value[:3] == b"v10":
        ciphertext = encrypted_value[3:]
        if len(ciphertext) == 0 or len(ciphertext) % 16 != 0:
            return ""
        try:
            from cryptography.hazmat.primitives.ciphers import Cipher, algorithms, modes
            iv = b" " * 16
            cipher = Cipher(algorithms.AES(key), modes.CBC(iv))
            decryptor = cipher.decryptor()
            decrypted = decryptor.update(ciphertext) + decryptor.finalize()
            padding_len = decrypted[-1]
            if not isinstance(padding_len, int) or padding_len < 1 or padding_len > 16:
                return ""
            if any(b != padding_len for b in decrypted[-padding_len:]):
                return ""
            plain = decrypted[:-padding_len]
            # Chrome prepends a 32-byte HMAC-SHA256 to the actual value
            if len(plain) > 32:
                plain = plain[32:]
            result = plain.decode("utf-8", errors="strict")
            return result
        except Exception:
            return ""
    try:
        return encrypted_value.decode("utf-8", errors="strict")
    except Exception:
        return ""

def build_domain_filter():
    conditions = []
    for domain in YOUTUBE_DOMAINS:
        conditions.append(f"host_key LIKE '%{domain}'")
        conditions.append(f"host_key = '{domain.lstrip('.')}'")
    return " OR ".join(conditions)

def export_cookies(output_path):
    db_path = get_chrome_cookies_db()

    tmp_dir = tempfile.mkdtemp()
    tmp_db = os.path.join(tmp_dir, "Cookies")
    try:
        shutil.copy2(db_path, tmp_db)

        password = get_encryption_key()
        key = derive_key(password)

        conn = sqlite3.connect(tmp_db)
        cursor = conn.cursor()

        domain_filter = build_domain_filter()
        query = f"""
            SELECT host_key, name, encrypted_value, path, expires_utc, is_secure, is_httponly
            FROM cookies
            WHERE {domain_filter}
        """
        cursor.execute(query)
        rows = cursor.fetchall()
        conn.close()

        with open(output_path, "w") as f:
            f.write("# Netscape HTTP Cookie File\n")
            f.write(f"# Only YouTube/Google domains - exported at {time.strftime('%Y-%m-%d %H:%M:%S')}\n")
            f.write("# This file contains ONLY video-related cookies\n\n")

            count = 0
            for host_key, name, encrypted_value, path, expires_utc, is_secure, is_httponly in rows:
                value = decrypt_cookie_value(encrypted_value, key)
                if not value:
                    continue

                if expires_utc:
                    expires = str(int((expires_utc / 1_000_000) - 11644473600))
                else:
                    expires = "0"

                include_subdomains = "TRUE" if host_key.startswith(".") else "FALSE"
                secure = "TRUE" if is_secure else "FALSE"
                httponly_prefix = "#HttpOnly_" if is_httponly else ""

                f.write(f"{httponly_prefix}{host_key}\t{include_subdomains}\t{path}\t{secure}\t{expires}\t{name}\t{value}\n")
                count += 1

        print(f'{{"success": true, "count": {count}, "path": "{output_path}", "domains": {len(YOUTUBE_DOMAINS)}}}')

    finally:
        shutil.rmtree(tmp_dir, ignore_errors=True)

if __name__ == "__main__":
    output = sys.argv[1] if len(sys.argv) > 1 else os.path.expanduser("~/video-learn-mcp/cookies.txt")
    try:
        export_cookies(output)
    except Exception as e:
        print(f'{{"success": false, "error": "{str(e)}"}}')
        sys.exit(1)
