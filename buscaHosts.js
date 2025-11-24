const axios = require("axios");
const fs = require("fs");

// ===============================
// CONFIGURAÇÕES
// ===============================
const ZBX_URL = "http://10.51.9.130/zabbix";
const ZBX_API = `${ZBX_URL}/api_jsonrpc.php`;
const ZBX_USER = "UserAPI";
const ZBX_PASS = "z@bb1Xc0rp@ce55oAP1";
const OUTPUT_FILE = "./hosts_export.csv";

// ===============================
// FILTRO OPCIONAL DE GRUPO
// Se estiver vazio → busca todos
// Para ativar → descomente a linha abaixo
// const FILTER_GROUP = "Windows Servers";
const FILTER_GROUP = ""; // padrão: sem filtro

// ===============================
// FUNÇÕES
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

async function getAllHosts(token) {

    const params = {
        output: ["hostid", "host", "name", "status"],
        selectInterfaces: ["ip"],
        selectHostGroups: ["name"]
    };

    // Caso o filtro de grupo esteja ativo
    if (FILTER_GROUP && FILTER_GROUP.trim() !== "") {
        params.group = { name: FILTER_GROUP.trim() };
    }

    const payload = {
        jsonrpc: "2.0",
        method: "host.get",
        params,
        id: 2
    };

    const response = await axios.post(ZBX_API, payload, {
        headers: { 
            "Content-Type": "application/json-rpc",
            "Authorization": `Bearer ${token}`
        }
    });

    if (response.data.error) {
        throw new Error(`Erro hosts: ${response.data.error.data}`);
    }

    return response.data.result;
}

function statusToText(status) {
    return status == 0 ? "Ativo" : "Desativado";
}

// ===============================
// EXECUÇÃO
// ===============================
(async () => {
    try {
        console.log("🔐 Efetuando login na API...");
        const token = await getToken();
        console.log("✅ Token obtido com sucesso:", token);

        console.log("📌 Buscando todos os hosts...");
        const hosts = await getAllHosts(token);

        if (hosts.length === 0) {
            console.log("⚠️ Nenhum host encontrado.");
            return;
        }

        console.log(`📊 Total de hosts encontrados: ${hosts.length}`);

        // Cabeçalho CSV
        const csvLines = ["host;name;ips;grupos;status"];

        hosts.forEach(h => {
            const ips = h.interfaces?.map(i => i.ip).filter(ip => ip).join(", ") || "";

            const grupos = h.hostgroups?.map(g => g.name).filter(name => name).join(", ") || "Sem grupo";

            const status = statusToText(h.status);

            csvLines.push(
                `${h.host};${h.name};${ips};${grupos};${status}`
            );
        });

        // Salvar arquivo
        fs.writeFileSync(OUTPUT_FILE, csvLines.join("\n"));
        console.log(`\n📄 CSV gerado com sucesso: ${OUTPUT_FILE}`);
        console.log(`📊 Hosts processados: ${hosts.length}`);

    } catch (err) {
        console.error("❌ Erro:", err.message);
        console.error("Detalhes:", err.response?.data || err);
    }
})();
