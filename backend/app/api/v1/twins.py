from fastapi import APIRouter
from app.api.deps import CurrentUserDep, DbSession

router = APIRouter()

# Twin endpointi so na /vehicles/{id}/twin in /vehicles/{id}/snapshots
# Ta router je za morebitne dodatne twin operacije
