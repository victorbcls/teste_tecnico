import { Client } from "langsmith";

const DATASET_NAME = "aurora-support-eval";

async function main() {
  const client = new Client();

  const existing = await client
    .readDataset({ datasetName: DATASET_NAME })
    .catch(() => null);
  const dataset =
    existing ??
    (await client.createDataset(DATASET_NAME, {
      description: "Casos de avaliação do assistente de suporte Aurora.",
    }));

  await client.createExamples({
    inputs: [
      { question: "Liste todos os chamados abertos." },
      {
        question:
          "Consulte o CH-102 e prepare um escalonamento se ele estiver aberto.",
      },
    ],
    outputs: [
      { expectedChamados: ["CH-101", "CH-103"] },
      { expectedBehavior: "não escalonar, chamado já resolvido" },
    ],
    datasetId: dataset.id,
  });

  console.log(`Dataset "${DATASET_NAME}" (${dataset.id}) populado com 2 exemplos.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
