const axios = require ("axios")
const fs = require ("fs")
const readline = require ("readline")

// ===============================
// CONFIGURAÇÕES
// ===============================
const ZBX_URL = "http://10.51.9.130/zabbix";
const ZBX_API = `${ZBX_URL}/api_jsonrpc.php`;
const ZBX_USER = "UserAPI";
const ZBX_PASS = "z@bb1Xc0rp@ce55oAP1";
const HOSTS_FILE = "./hosts.txt"; // Arquivo onde ira ter os nomes dos hosts = ao cadastrado no zabbix
const OUTPUT_FILE = ".itensExportados.csv"; // Arquivo de saida dos itens encontrados
const PERIOD_DAYS = 30; // últimos X dias

// Lista de nomes dos itens exatamente como aparecem no Zabbix
const ITEMS_NAMES = [
  "CPU - Carga de Processamento (1m)"
];

// ===============================
// FUNÇÃO PARA OBTER TOKEN
// ===============================
async function getToken() {
  const payload = {
    jsonrpc: "2.0",
    method: "user.login",
    params: { username: ZBX_USER, password: ZBX_PASS },
    id: 1
  };
  const { data } = await axios.post(ZBX_API, payload, {
    headers: { "Content-Type": "application/json-rpc" }
  });
  if (!data.result) throw new Error("Falha ao obter token via API");
  return data.result;
}

// ===============================
// FUNÇÃO QUE BUSCA OS DADOS DOS HOSTS NA API
// ===============================

async function getHostId(token, hostname) {
  const payload = {
    jsonrpc: "2.0",
    method: "host.get",
    params: {
      output: ["hostid"],
      search: { host: hostname },
      searchWildcardsEnabled: true
    },
    id: 1
  };

  const { data } = await axios.post(ZBX_API, payload, {
    headers: {
      "Content-Type": "application/json-rpc",
      "Authorization": `Bearer ${token}`
    }
  });

  if (!data.result || data.result.length === 0) return null;
  return data.result[0].hostid;
}

// ===============================
// FUNÇÃO QUE BUSCA OS DADOS COMBINANDO, HOST E ITEM/VALOR
// ===============================

async function getItemByName(token, hostId, itemName) {
  const payload = {
    jsonrpc: "2.0",
    method: "item.get",
    params: {
      output: ["itemid", "name", "value_type"],
      hostids: [hostId],
      search: { name: itemName },
      searchWildcardsEnabled: true
    },
    id: 1
  };

  const { data } = await axios.post(ZBX_API, payload, {
    headers: {
      "Content-Type": "application/json-rpc",
      "Authorization": `Bearer ${token}`
    }
  });

  if (!data.result || data.result.length === 0) return null;
  return data.result[0];
}

// ===============================
// FUNÇÃO QUE BUSCA OS DADOS HISTORICOS (min, média e maximo) COMBINANDO, HOST E ITEM/VALOR
// ===============================

async function getHistoryValues(token, itemId, valueType, days) {
  const now = Math.floor(Date.now() / 1000);
  const timeFrom = now - (days * 24 * 60 * 60);

  const payload = {
    jsonrpc: "2.0",
    method: "history.get",
    params: {
      output: "extend",
      history: valueType,
      itemids: [itemId],
      time_from: timeFrom,
      time_till: now,
      sortfield: "clock",
      sortorder: "ASC",
      limit: 10000
    },
    id: 1
  };

  const { data } = await axios.post(ZBX_API, payload, {
    headers: {
      "Content-Type": "application/json-rpc",
      "Authorization": `Bearer ${token}`
    }
  });

  if (!data.result || data.result.length === 0) return [];
  return data.result.map(v => parseFloat(v.value));
}

// ===============================
// EXECUÇÃO DO CÓDIGO
// ===============================

(async () => {
  try {
    console.log("🔐 Efetuando login na API...");
    const token = await getToken();
    console.log("✅ Token obtido via API.");

    const rl = readline.createInterface({
      input: fs.createReadStream(HOSTS_FILE),
      crlfDelay: Infinity
    });

    // Cabeçalho CSV
    let header = ["hostname"];
    for (const item of ITEMS_NAMES) {
      header.push(`${item} (min)`, `${item} (avg)`, `${item} (max)`);
    }
    const csvLines = [header.join(";")];

    for await (const line of rl) {
      const hostname = line.trim();
      if (!hostname) continue;

      console.log(`\n🔎 Processando host: ${hostname}`);
      const hostId = await getHostId(token, hostname);
      if (!hostId) {
        console.log(`⚠️ Host não encontrado: ${hostname}`);
        continue;
      }

      const row = [hostname];

      for (const itemName of ITEMS_NAMES) {
        const item = await getItemByName(token, hostId, itemName);
        if (!item) {
          console.log(`⚠️ Item não encontrado: ${itemName}`);
          row.push("N/A", "N/A", "N/A");
          continue;
        }

        const values = await getHistoryValues(token, item.itemid, item.value_type, PERIOD_DAYS);
        if (values.length === 0) {
          console.log(`⚠️ Sem dados históricos para: ${itemName}`);
          row.push("N/A", "N/A", "N/A");
          continue;
        }

        const min = Math.min(...values).toFixed(2);
        const avg = (values.reduce((a, b) => a + b, 0) / values.length).toFixed(2);
        const max = Math.max(...values).toFixed(2);

        console.log(`✅ ${itemName} → min: ${min} | avg: ${avg} | max: ${max}`);
        row.push(min, avg, max);
      }

      csvLines.push(row.join(";"));
    }

    // console.log(csvLines) // Imprimi na tela o resultado
    fs.writeFileSync(OUTPUT_FILE, csvLines.join("\n")); // salva conteudo no arquivo
    console.log(`\n📄 CSV gerado com sucesso: ${OUTPUT_FILE}`);
  } catch (err) {
    console.error("❌ Erro:", err.message);
  }
})();