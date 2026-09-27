import os
from sqlmodel import SQLModel, create_engine, Session
from typing import Generator

# SQLite Database path relative to project
DATABASE_URL = os.getenv("DATABASE_URL", "sqlite:///./bank_statement_converter.db")

# connect_args={"check_same_thread": False} is required for SQLite in multithreaded environments like FastAPI
engine = create_engine(
    DATABASE_URL, 
    connect_args={"check_same_thread": False},
    echo=False
)

def init_db() -> None:
    """Initialize the database schema, creating all tables if they do not exist."""
    SQLModel.metadata.create_all(engine)

def get_db() -> Generator[Session, None, None]:
    """Dependency generator to yield database sessions to API routes."""
    with Session(engine) as session:
        yield session
