from sqlalchemy import Column, Integer, String
from app.database import Base


class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    spotify_id = Column(String, unique=True, index=True, nullable=False)
    email = Column(String, unique=True, index=True, nullable=True)
    display_name = Column(String, nullable=True)
    spotify_access_token = Column(String, nullable=True)
    spotify_refresh_token = Column(String, nullable=True)
