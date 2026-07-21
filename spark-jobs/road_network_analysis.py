"""
Road-network analysis with Spark GraphFrames (educational).

What big tech uses this for: Google/Meta/LinkedIn run PageRank-style and
connected-components jobs over graphs with billions of edges. Here the same
APIs run over Al Ula's road graph so every step is inspectable.

Run on the processing VM (extended profile):

  docker exec maps-spark spark-submit \
    --packages graphframes:graphframes:0.8.3-spark3.5-s_2.12 \
    /jobs/road_network_analysis.py /data/nodes.csv /data/edges.csv

Inputs come from `node etl/export-edges.mjs`.
"""
import sys

from pyspark.sql import SparkSession
from pyspark.sql import functions as F

try:
    from graphframes import GraphFrame
except ImportError:
    sys.exit("graphframes not on classpath — pass --packages graphframes:...")


def main(nodes_csv: str, edges_csv: str) -> None:
    spark = SparkSession.builder.appName("road-network-analysis").getOrCreate()

    vertices = (
        spark.read.option("header", True)
        .csv(nodes_csv)
        .withColumnRenamed("id", "id")
    )
    edges = (
        spark.read.option("header", True)
        .csv(edges_csv)
        .withColumnRenamed("src", "src")
        .withColumnRenamed("dst", "dst")
        .withColumn("length_m", F.col("length_m").cast("double"))
    )

    g = GraphFrame(vertices, edges)

    # 1. PageRank: which junctions is the network most "dependent" on?
    #    (Pregel-style iterative message passing under the hood.)
    pr = g.pageRank(resetProbability=0.15, maxIter=10)
    print("=== Top-10 junctions by PageRank ===")
    pr.vertices.orderBy(F.desc("pagerank")).select("id", "pagerank").show(10)

    # 2. Connected components: is the road network one connected city,
    #    or are there unreachable islands (data-quality signal)?
    spark.sparkContext.setCheckpointDir("/tmp/spark-checkpoints")
    cc = g.connectedComponents()
    print("=== Component sizes ===")
    cc.groupBy("component").count().orderBy(F.desc("count")).show(10)

    # 3. Degree distribution: intersections vs dead ends.
    print("=== Degree distribution ===")
    g.degrees.groupBy("degree").count().orderBy("degree").show(20)

    spark.stop()


if __name__ == "__main__":
    if len(sys.argv) != 3:
        sys.exit("usage: road_network_analysis.py <nodes.csv> <edges.csv>")
    main(sys.argv[1], sys.argv[2])
