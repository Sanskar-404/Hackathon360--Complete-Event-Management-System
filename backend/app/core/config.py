from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict

class Settings(BaseSettings):
    app_name: str = "HACKOS"
    secret_key: str = "dev-only-change-me"
    database_url: str = "sqlite:///./hackos.db"
    access_token_minutes: int = 720

    bootstrap_key: str = Field(
        default="CHANGE-THIS-BOOTSTRAP-KEY-BEFORE-USE",
        validation_alias="HACKOS_BOOTSTRAP_KEY"
    )

    cors_origins: str = "http://localhost:5173"

    model_config = SettingsConfigDict(
        env_file=".env",
        extra="ignore"
    )

    @property
    def origins(self):
        return [
            x.strip()
            for x in self.cors_origins.split(",")
            if x.strip()
        ]

settings = Settings()