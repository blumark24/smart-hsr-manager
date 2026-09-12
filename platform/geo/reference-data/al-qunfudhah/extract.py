#!/usr/bin/env python3
"""Regenerate the Al-Qunfudhah real-data reference extract for SMART HSR Geo Core.

See SOURCE.md in this directory for what this data is (and is not) used for.

Requirements:
    pip install overturemaps pyarrow

This calls the overturemaps library's reader directly instead of the
`overturemaps` CLI because the CLI validates its `--release` argument
against Overture's STAC catalog (https://stac.overturemaps.org), which is
an extra network dependency this script does not need: the release string
below is pinned explicitly, and record_batch_reader() reads straight from
the public S3 dataset with no catalog lookup.

Re-run this whenever a newer Overture release should replace the pinned one
below (place/buildings.geojson will be overwritten in place).
"""
import json
import os

from overturemaps.core import record_batch_reader
from overturemaps.writers import get_writer, copy

RELEASE = "2026-08-19.0"
HERE = os.path.dirname(os.path.abspath(__file__))

EXTRACTS = [
    dict(
        overture_type="place",
        bbox=(40.90, 18.95, 41.25, 19.30),
        out=os.path.join(HERE, "places.geojson"),
    ),
    dict(
        overture_type="building",
        bbox=(41.065, 19.118, 41.093, 19.136),
        out=os.path.join(HERE, "buildings.geojson"),
    ),
]


def main():
    for spec in EXTRACTS:
        reader = record_batch_reader(
            spec["overture_type"], bbox=spec["bbox"], release=RELEASE, stac=False
        )
        if reader is None:
            raise SystemExit(f"No data returned for {spec['overture_type']}")
        writer = get_writer("geojson", spec["out"], reader.schema)
        with writer:
            copy(reader, writer)
        with open(spec["out"]) as f:
            count = len(json.load(f)["features"])
        print(f"{spec['overture_type']}: wrote {count} features to {spec['out']}")


if __name__ == "__main__":
    main()
