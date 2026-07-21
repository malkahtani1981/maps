// Load the road graph into Memgraph (or Neo4j) from the CSVs produced by
// etl/export-edges.mjs. Run inside the memgraph container, e.g.:
//   docker exec -i maps-memgraph mgconsole < etl/load-memgraph.cypher
// (mount ./data into the container at /data first)

CREATE INDEX ON :Junction(id);

LOAD CSV FROM "/data/nodes.csv" WITH HEADER AS row
CREATE (:Junction {id: ToInteger(row.id), lat: ToFloat(row.lat), lon: ToFloat(row.lon)});

LOAD CSV FROM "/data/edges.csv" WITH HEADER AS row
MATCH (a:Junction {id: ToInteger(row.src)}), (b:Junction {id: ToInteger(row.dst)})
CREATE (a)-[:ROAD {length_m: ToFloat(row.length_m), way_id: ToInteger(row.way_id)}]->(b);

// Sanity check + first Cypher lesson: highest-degree junctions
MATCH (j:Junction)-[r:ROAD]->()
RETURN j.id, count(r) AS out_degree
ORDER BY out_degree DESC LIMIT 10;
