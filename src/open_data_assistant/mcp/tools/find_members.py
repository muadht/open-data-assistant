"""The `find_members` MCP tool.

Resolves a phrase like "Ontario" or "25 to 34 years" to member IDs within one dimension of
one table. Fetches members live via getCubeMetadata rather than reading the catalogue index,
since the index deliberately excludes leaf-level members (see
docs/mcp-tools-and-data-contract.md's "Index design" section) and member meaning is
table-specific.
"""

from __future__ import annotations

from ...wds.client import WdsClient
from ..schemas import MemberCandidate


def find_members(
    client: WdsClient, product_id: int, dimension_position_id: int, query: str
) -> list[MemberCandidate]:
    [item] = client.get_cube_metadata([product_id])
    if item["status"] != "SUCCESS":
        raise ValueError(f"getCubeMetadata failed for product {product_id}: {item}")
    obj = item["object"]

    dimension = next(
        (d for d in obj["dimension"] if d["dimensionPositionId"] == dimension_position_id),
        None,
    )
    if dimension is None:
        raise ValueError(f"Table {product_id} has no dimension at position {dimension_position_id}")

    query_lower = query.lower()
    return [
        MemberCandidate(
            member_id=m["memberId"],
            name_en=m["memberNameEn"],
            parent_member_id=m.get("parentMemberId"),
            terminated=bool(m.get("terminated")),
        )
        for m in dimension["member"]
        if query_lower in m["memberNameEn"].lower()
    ]
