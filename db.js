// ==========================================
// 1. CONFIGURAZIONE E INIZIALIZZAZIONE SUPABASE
// ==========================================
const SUPABASE_URL = "https://nafessiwwdyjonisapxm.supabase.co";
const SUPABASE_KEY = "sb_publishable_MapN_q9Z-FsXpapSkHHWHQ_6b0MF8hD";

// Creazione del client Supabase per connettere il browser al cloud
const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

// ==========================================
// 2. OGGETTO DB (METODI BASE DAL vecchio db.js)
// ==========================================
const DB = {
    // Recupera l'intero inventario ordinato dal database
    async getInventario() {
        const { data, error } = await supabaseClient
            .from('inventario')
            .select('*')
            .order('id', { ascending: true });
        if (error) {
            console.error("Errore nel caricamento dell'inventario:", error);
            return [];
        }
        // Trasformiamo max_qty (database) in maxQty (usato nel codice HTML)
        return data ? data.map(p => ({ ...p, maxQty: p.max_qty })) : [];
    },

    // Aggiorna un campo specifico di un determinato prodotto (es. la quantità 'qty')
    async updateSpecificitaProdotto(id, nuoveProprieta) {
        if (nuoveProprieta.maxQty !== undefined) {
            nuoveProprieta.max_qty = nuoveProprieta.maxQty;
            delete nuoveProprieta.maxQty;
        }
        const { error } = await supabaseClient
            .from('inventario')
            .update(nuoveProprieta)
            .eq('id', id);
        if (error) console.error("Errore nell'aggiornamento del prodotto:", error);
    },

    // Legge il budget aziendale memorizzato nella tabella configurazione
    async getBudget() {
        const { data, error } = await supabaseClient
            .from('configurazione')
            .select('valore')
            .eq('chiave', 'budgetAziendale')
            .single();
        if (error) return 5000.00; // Valore di riserva se c'è un errore
        return parseFloat(data.valore);
    },

    // Sovrascrive il budget aziendale aggiornato
    async updateBudget(nuovoBudget) {
        const { error } = await supabaseClient
            .from('configurazione')
            .upsert({ chiave: 'budgetAziendale', valore: nuovoBudget.toFixed(2) });
        if (error) console.error("Errore nel salvataggio del budget:", error);
    },

    // Recupera lo storico di tutte le vendite effettuate
    async getVendite() {
        const { data, error } = await supabaseClient
            .from('vendite')
            .select('*')
            .order('data', { ascending: true });
        if (error) console.error("Errore nel recupero delle vendite:", error);
        return data || [];
    },

    // Aggiunge una nuova riga di vendita con data odierna automatica
    async registraVendita(totale) {
        const { error } = await supabaseClient
            .from('vendite')
            .insert([{ totale: parseFloat(totale), data: new Date().toISOString().split('T')[0] }]);
        if (error) console.error("Errore nella registrazione della vendita:", error);
    }
};

// ==========================================
// 3. FUNZIONI GLOBALI (usate dalle pagine HTML)
//    - Caricano/salvano su Supabase usando DB o direttamente supabaseClient
// ==========================================

// INVENTARIO
async function loadInventario() {
    return await DB.getInventario();
}

async function saveInventario(inventario) {
    // Converte maxQty in max_qty per il database
    const dataToSave = inventario.map(p => {
        const item = { ...p, max_qty: p.maxQty };
        delete item.maxQty;
        return item;
    });
    const { error } = await supabaseClient.from('inventario').upsert(dataToSave);
    if (error) console.error("Errore nel salvataggio dell'inventario su Supabase:", error);
}

// BUDGET
async function loadBudget() {
    return await DB.getBudget();
}

async function saveBudget(budget) {
    await DB.updateBudget(budget);
}

// VENDITE
async function loadVendite() {
    return await DB.getVendite();
}

async function saveVendite(vendite) {
    // Sostituisce tutte le vendite con il nuovo array (upsert)
    const { error } = await supabaseClient.from('vendite').upsert(vendite);
    if (error) console.error("Errore nel salvataggio delle vendite su Supabase:", error);
}

// ==========================================
// 4. FUNZIONI PER DATI LOCALI (spese, carrello manager, offerte)
//    - Rimangono in localStorage per semplicità
// ==========================================

const STORAGE_KEYS = {
    expenses: 'expenses',
    managerCart: 'managerCart',
    carrelloCheckout: 'carrelloCheckout',
    totaleCheckout: 'totaleCheckout',
    ultimoTotale: 'ultimoTotale',
    saleInfo: 'saleInfo'
};

const SALE_INFO_DEFAULT = {
    title: 'Offerte Lampo',
    percentuale: 25,
    expiresAt: new Date(Date.now() + 1000 * 60 * 30).toISOString(),
    productIds: [1, 2, 8, 12]
};

function ensureDatabase() {
    if (!localStorage.getItem(STORAGE_KEYS.expenses)) {
        localStorage.setItem(STORAGE_KEYS.expenses, JSON.stringify([]));
    }
    if (!localStorage.getItem(STORAGE_KEYS.saleInfo)) {
        localStorage.setItem(STORAGE_KEYS.saleInfo, JSON.stringify(SALE_INFO_DEFAULT));
    }
}

// SPESE
function loadExpenses() {
    ensureDatabase();
    return JSON.parse(localStorage.getItem(STORAGE_KEYS.expenses));
}
function saveExpenses(expenses) {
    localStorage.setItem(STORAGE_KEYS.expenses, JSON.stringify(expenses));
}
function recordExpense(entry) {
    const ex = loadExpenses();
    ex.push(entry);
    saveExpenses(ex);
}

// CARRELLO MANAGER
function loadManagerCart() {
    return JSON.parse(localStorage.getItem(STORAGE_KEYS.managerCart) || '[]');
}
function saveManagerCart(cart) {
    localStorage.setItem(STORAGE_KEYS.managerCart, JSON.stringify(cart));
}
function clearManagerCart() {
    localStorage.removeItem(STORAGE_KEYS.managerCart);
}

// OFFERTE (sale)
function loadSaleInfo() {
    ensureDatabase();
    return JSON.parse(localStorage.getItem(STORAGE_KEYS.saleInfo));
}
function saveSaleInfo(saleInfo) {
    localStorage.setItem(STORAGE_KEYS.saleInfo, JSON.stringify(saleInfo));
}
function getSaleInfo() {
    const info = loadSaleInfo();
    if (!info || !info.expiresAt) return null;
    const expired = new Date(info.expiresAt) <= new Date();
    return { ...info, active: !expired };
}
function isSaleActive() {
    const info = getSaleInfo();
    return info && info.active;
}
function getSaleRemainingSeconds() {
    const info = getSaleInfo();
    if (!info || !info.active) return 0;
    return Math.max(0, Math.floor((new Date(info.expiresAt) - new Date()) / 1000));
}
function isProductOnSale(item) {
    const info = getSaleInfo();
    return info && info.active && Array.isArray(info.productIds) && info.productIds.includes(item.id);
}
function getDiscountedPrice(prezzo, item) {
    return isProductOnSale(item)
        ? Number((prezzo * (1 - getSaleInfo().percentuale / 100)).toFixed(2))
        : prezzo;
}

// UTILITY
function formatCurrency(value) {
    return `€ ${Number(value).toFixed(2)}`;
}