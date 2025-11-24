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
const HOSTS_FILE = "./hosts.txt";
const OUTPUT_FILE = "./itensExportados.csv";
const PERIOD_DAYS = 30; // últimos X dias

// Lista de nomes dos itens exatamente como aparecem no Zabbix que RETORNAM TEXTO
const ITEMS_NAMES = [
  "Sistema Operacional - Info S.O."
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
// FUNÇÃO QUE BUSCA OS DADOS HISTORICOS COMBINANDO, HOST E ITEM/VALOR
// ===============================

async function getLastHistoryValue(token, itemId, valueType) {
  const payload = {
    jsonrpc: "2.0",
    method: "history.get",
    params: {
      output: "extend",
      itemids: [itemId],
      history: valueType,
      sortfield: "clock",
      sortorder: "DESC",
      limit: 1
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
  return data.result[0].value; // retorna como texto, sem parseFloat
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
    let header = ["hostname", ...ITEMS_NAMES];
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
          row.push("N/A");
          continue;
        }

        const lastValue = await getLastHistoryValue(token, item.itemid, item.value_type);

        if (!lastValue) {
          console.log(`⚠️ Sem histórico para: ${itemName}`);
          row.push("N/A");
          continue;
        }

        console.log(`✅ ${itemName} → ${lastValue}`);
        row.push(lastValue);
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