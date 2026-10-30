from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    app_name: str = 'NEXUS_SHIELD_AI'
    environment: str = 'development'
    port: int = 8001
    api_base_url: str = 'http://localhost:4000'

    class Config:
        env_file = '.env'


settings = Settings()
