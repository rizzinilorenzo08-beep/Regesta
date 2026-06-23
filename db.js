// ==========================================
// 1. CONFIGURAZIONE E INIZIALIZZAZIONE SUPABASE
// ==========================================
const SUPABASE_URL = "https://nafessiwwdyjonisapxm.supabase.co";
const SUPABASE_KEY = "sb_publishable_MapN_q9Z-FsXpapSkHHWHQ_6b0MF8hD";

// Creazione del client Supabase per connettere il browser al cloud
const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

// ==========================================
// 2. OGGETTO DB (METODI BASE)
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
        return data ? data.map(p => ({ ...p, maxQty: p.max_qty })) : [];
    },

    // Aggiorna un campo specifico di un determinato prodotto
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
        if (error) return 67000.00;
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
        if (error) {
            console.error("Errore nel recupero delle vendite:", error);
            return [];
        }
        return data || [];
    },

    // Aggiunge una nuova riga di vendita con data odierna automatica (INSERT)
    async registraVendita(totale) {
        const { data, error } = await supabaseClient
            .from('vendite')
            .insert([{ 
                totale: parseFloat(totale), 
                data: new Date().toISOString().split('T')[0] 
            }])
            .select();
        if (error) {
            console.error("Errore nella registrazione della vendita:", error);
            return { success: false, error: error.message };
        }
        return { success: true, data: data };
    }
};

// ==========================================
// 3. FUNZIONI GLOBALI (usate dalle pagine HTML)
// ==========================================

// INVENTARIO
async function loadInventario() {
    return await DB.getInventario();
}

async function saveInventario(inventario) {
    const dataToSave = inventario.map(p => {
        const item = { ...p, max_qty: p.maxQty };
        delete item.maxQty;
        if (!item.icona) item.icona = '📦';
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

// VENDITE - VERSIONE CORRETTA CON INSERT
async function loadVendite() {
    return await DB.getVendite();
}

// ❌ RIMOSSA saveVendite() - usa invece registraVendita()
async function registraVendita(totale) {
    return await DB.registraVendita(totale);
}

// ==========================================
// 4. FUNZIONI PER DATI LOCALI
// ==========================================

const STORAGE_KEYS = {
    expenses: 'expenses',
    managerCart: 'managerCart',
    carrelloCheckout: 'carrelloCheckout',
    totaleCheckout: 'totaleCheckout',
    ultimoTotale: 'ultimoTotale',
    saleInfo: 'saleInfo'
};

const SALE_DURATION_MS = 1000 * 60 * 30; // 30 minuti
const NEXT_SALE_DELAY_MS = 1000 * 60 * 5; // 5 minuti
const SALE_PRODUCTS_COUNT = 10;
const SALE_DISCOUNT_MIN = 10;
const SALE_DISCOUNT_MAX = 30;

const SALE_INFO_DEFAULT = {
    title: 'Prossima Offerta',
    expiresAt: new Date(Date.now() - 1000).toISOString(),
    nextSaleAt: new Date(Date.now() + NEXT_SALE_DELAY_MS).toISOString(),
    productIds: [],
    productDiscounts: {}
};

function getRandomSaleDiscount() {
    return Math.floor(Math.random() * (SALE_DISCOUNT_MAX - SALE_DISCOUNT_MIN + 1)) + SALE_DISCOUNT_MIN;
}

function pickRandomProductIds(items, count) {
    const ids = items.map(item => item.id);
    for (let i = ids.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [ids[i], ids[j]] = [ids[j], ids[i]];
    }
    return ids.slice(0, Math.min(count, ids.length));
}

async function createNewSaleInfo() {
    const inventory = await loadInventario();
    const candidates = inventory.filter(item => item.qty > 0);
    const selectedIds = pickRandomProductIds(candidates, SALE_PRODUCTS_COUNT);
    if (selectedIds.length === 0) {
        return null;
    }

    const productDiscounts = {};
    selectedIds.forEach(id => {
        productDiscounts[id] = getRandomSaleDiscount();
    });

    return {
        title: 'Offerte Lampo',
        expiresAt: new Date(Date.now() + SALE_DURATION_MS).toISOString(),
        nextSaleAt: null,
        productIds: selectedIds,
        productDiscounts
    };
}

function createNextSaleInfo() {
    return {
        title: 'Prossima Offerta',
        expiresAt: new Date(Date.now() - 1000).toISOString(),
        nextSaleAt: new Date(Date.now() + NEXT_SALE_DELAY_MS).toISOString(),
        productIds: [],
        productDiscounts: {}
    };
}

async function ensureSaleSchedule() {
    ensureDatabase();
    const info = loadSaleInfo();
    const now = new Date();

    if (!info) {
        const newSale = await createNewSaleInfo();
        if (newSale) {
            saveSaleInfo(newSale);
            return;
        }
        saveSaleInfo(createNextSaleInfo());
        return;
    }

    const expiresAt = info.expiresAt ? new Date(info.expiresAt) : null;
    const nextSaleAt = info.nextSaleAt ? new Date(info.nextSaleAt) : null;

    if (expiresAt && expiresAt > now) {
        return;
    }

    if (nextSaleAt && nextSaleAt > now) {
        return;
    }

    if (nextSaleAt && nextSaleAt <= now) {
        const newSale = await createNewSaleInfo();
        if (newSale) {
            saveSaleInfo(newSale);
            return;
        }
    }

    saveSaleInfo(createNextSaleInfo());
}

function getSaleDiscountPercent(item) {
    const info = getSaleInfo();
    if (!info || !info.active) return 0;
    if (info.productDiscounts && info.productDiscounts[item.id] != null) {
        return info.productDiscounts[item.id];
    }
    if (Array.isArray(info.productIds) && info.productIds.includes(item.id) && info.percentuale != null) {
        return info.percentuale;
    }
    return 0;
}

function getSaleDiscountRange() {
    const info = getSaleInfo();
    if (!info || !info.active) return null;
    const discounts = info.productDiscounts ? Object.values(info.productDiscounts) : [];
    if (discounts.length > 0) {
        return { min: Math.min(...discounts), max: Math.max(...discounts) };
    }
    if (info.percentuale != null) {
        return { min: info.percentuale, max: info.percentuale };
    }
    return null;
}

function getNextSaleRemainingSeconds() {
    const info = loadSaleInfo();
    if (!info || !info.nextSaleAt) return 0;
    return Math.max(0, Math.floor((new Date(info.nextSaleAt) - new Date()) / 1000));
}

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
    const discount = getSaleDiscountPercent(item);
    return discount > 0 ? Number((prezzo * (1 - discount / 100)).toFixed(2)) : prezzo;
}

// ==========================================
// 5. FUNZIONI PER CLIENTI REGISTRATI E PUNTI SPESA
// ==========================================

const DB_CLIENTI = {
    async registraCliente(email, password, nome) {
        const { data, error } = await supabaseClient
            .from('clienti')
            .select('email')
            .eq('email', email)
            .single();
        
        if (data) {
            return { success: false, error: 'Email già registrata' };
        }

        const { data: newClient, error: insertError } = await supabaseClient
            .from('clienti')
            .insert([{ 
                email, 
                password: btoa(password),
                nome,
                punti_spesa: 0,
                data_registrazione: new Date().toISOString()
            }])
            .select();

        if (insertError) {
            console.error("Errore nella registrazione del cliente:", insertError);
            return { success: false, error: insertError.message };
        }

        return { success: true, cliente: newClient[0] };
    },

    async loginCliente(email, password) {
        const { data, error } = await supabaseClient
            .from('clienti')
            .select('*')
            .eq('email', email)
            .single();

        if (error || !data) {
            return { success: false, error: 'Email non trovata' };
        }

        if (atob(data.password) !== password) {
            return { success: false, error: 'Password errata' };
        }

        return { success: true, cliente: data };
    },

    async getCliente(clienteId) {
        const { data, error } = await supabaseClient
            .from('clienti')
            .select('*')
            .eq('id', clienteId)
            .single();

        if (error) {
            console.error("Errore nel caricamento del cliente:", error);
            return null;
        }

        return data;
    },

    async aggiungiPuntiSpesa(clienteId, totaleAcquisto) {
        const nuoviPunti = Math.floor(totaleAcquisto / 15);
        
        const cliente = await this.getCliente(clienteId);
        if (!cliente) return { success: false, error: 'Cliente non trovato' };

        const puntiTotali = cliente.punti_spesa + nuoviPunti;

        const { error } = await supabaseClient
            .from('clienti')
            .update({ punti_spesa: puntiTotali })
            .eq('id', clienteId);

        if (error) {
            console.error("Errore nell'aggiornamento dei punti:", error);
            return { success: false, error: error.message };
        }

        return { success: true, puntiAggiunti: nuoviPunti, puntiTotali };
    },

    async usaPuntiSpesa(clienteId, puntiBudget, totaleAcquisto) {
        const cliente = await this.getCliente(clienteId);
        if (!cliente) return { success: false, error: 'Cliente non trovato' };

        const puntiRimanenti = cliente.punti_spesa - puntiBudget;
        if (puntiRimanenti < 0) {
            return { success: false, error: 'Punti insufficienti' };
        }

        const { error } = await supabaseClient
            .from('clienti')
            .update({ punti_spesa: puntiRimanenti })
            .eq('id', clienteId);

        if (error) {
            console.error("Errore nell'utilizzo dei punti:", error);
            return { success: false, error: error.message };
        }

        return { success: true, puntiRimanenti };
    },

    async getOfferteSpesa() {
        const { data, error } = await supabaseClient
            .from('offerte_spesa')
            .select('*')
            .order('punti_richiesti', { ascending: true });

        if (error) {
            console.error("Errore nel caricamento delle offerte:", error);
            return [];
        }

        return data || [];
    },

    async aggiungiOffertaSpesa(nome, descrizione, puntiRichiesti, scontoEuro) {
        const { data, error } = await supabaseClient
            .from('offerte_spesa')
            .insert([{
                nome,
                descrizione,
                punti_richiesti: puntiRichiesti,
                sconto_euro: scontoEuro
            }])
            .select();

        if (error) {
            console.error("Errore nell'aggiunta dell'offerta:", error);
            return { success: false, error: error.message };
        }

        return { success: true, offerta: data[0] };
    }
};

// ==========================================
// 6. FUNZIONI GLOBALI PER CLIENTI E PUNTI
// ==========================================

const STORAGE_KEYS_CLIENTI = {
    clienteLoggato: 'clienteLoggato'
};

function salvaClienteLoggato(cliente) {
    localStorage.setItem(STORAGE_KEYS_CLIENTI.clienteLoggato, JSON.stringify(cliente));
}

function caricaClienteLoggato() {
    const cliente = localStorage.getItem(STORAGE_KEYS_CLIENTI.clienteLoggato);
    return cliente ? JSON.parse(cliente) : null;
}

function logoutCliente() {
    localStorage.removeItem(STORAGE_KEYS_CLIENTI.clienteLoggato);
}

function isClienteLoggato() {
    return caricaClienteLoggato() !== null;
}

function formatCurrency(value) {
    return `€ ${Number(value).toFixed(2)}`;
}