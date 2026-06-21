from typing import Protocol

from models import FundedCompany


class FundingParser(Protocol):
    source: str

    async def fetch_funded_companies(self) -> list[FundedCompany]: ...
