from fastapi import APIRouter

router = APIRouter()


@router.get('/health')
def health():
    return {'service': 'nexus-shield-ai-engine', 'ok': True}
