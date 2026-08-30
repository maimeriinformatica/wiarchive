"""
Dove finiscono i video archiviati.
- Con S3_ENDPOINT + S3_ACCESS_KEY + S3_SECRET_KEY + S3_BUCKET impostati
  → bucket S3 compatibile (Cloudflare R2, Backblaze B2, …): capiente e adatto a Render.
- Altrimenti → cartella locale data/video (solo per prove sul proprio PC).
"""
import os

S3_ENDPOINT = os.environ.get("S3_ENDPOINT", "")
S3_KEY = os.environ.get("S3_ACCESS_KEY", "")
S3_SECRET = os.environ.get("S3_SECRET_KEY", "")
S3_BUCKET = os.environ.get("S3_BUCKET", "")
S3_REGION = os.environ.get("S3_REGION", "auto")
LOCAL_DIR = os.path.join(os.path.dirname(__file__), "data", "video")
USE_S3 = bool(S3_ENDPOINT and S3_KEY and S3_SECRET and S3_BUCKET)

_client = None
def client():
    global _client
    if _client is None:
        import boto3
        from botocore.config import Config
        _client = boto3.client("s3", endpoint_url=S3_ENDPOINT, region_name=S3_REGION,
                               aws_access_key_id=S3_KEY, aws_secret_access_key=S3_SECRET,
                               config=Config(s3={"addressing_style": "path"}, signature_version="s3v4"))
    return _client


def put_file(key, filepath, content_type="video/mp4"):
    """Carica un file dal disco (multipart automatico per i file grandi)."""
    if USE_S3:
        client().upload_file(filepath, S3_BUCKET, key, ExtraArgs={"ContentType": content_type})
    else:
        dest = os.path.join(LOCAL_DIR, key)
        os.makedirs(os.path.dirname(dest), exist_ok=True)
        os.replace(filepath, dest)


def url_for_player(key, expires=7200):
    """URL temporaneo firmato (S3) oppure None: in locale serve la rotta Flask."""
    if USE_S3:
        return client().generate_presigned_url("get_object",
            Params={"Bucket": S3_BUCKET, "Key": key}, ExpiresIn=expires)
    return None


def local_path(key):
    p = os.path.join(LOCAL_DIR, key)
    return p if os.path.isfile(p) else None


def delete(key):
    if USE_S3:
        client().delete_object(Bucket=S3_BUCKET, Key=key)
    else:
        p = os.path.join(LOCAL_DIR, key)
        if os.path.isfile(p):
            os.remove(p)
