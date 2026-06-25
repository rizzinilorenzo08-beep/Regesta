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

// Offerte manuali del manager caricate da Supabase (usate in entrambe le viste)
let _offerteFlashDB = [];

async function syncOfferteFlash() {
    try {
        const { data, error } = await supabaseClient
            .from('offerte_flash')
            .select('*')
            .eq('attiva', true);
        _offerteFlashDB = (!error && data) ? data : [];
    } catch (e) {
        console.warn('syncOfferteFlash: impossibile caricare da Supabase', e);
        _offerteFlashDB = [];
    }
}

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
    // 1. Controlla prima le offerte manuali del manager (Supabase)
    const offertaDB = _offerteFlashDB.find(o => o.prodotto_id === item.id);
    if (offertaDB) return offertaDB.sconto;

    // 2. Fallback: sistema automatico da localStorage
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
    // Offerte manuali Supabase hanno priorità
    if (_offerteFlashDB.some(o => o.prodotto_id === item.id)) return true;
    // Sistema automatico localStorage
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

// ==========================================
// 6. GESTIONE UTENTI E RUOLI (MANAGER)
// ==========================================

const DB_UTENTI = {
    // Login utente manager
    async loginUtente(email, password) {
        const { data, error } = await supabaseClient
            .from('utenti')
            .select('*')
            .eq('email', email)
            .single();

        if (error || !data) {
            return { success: false, error: 'Email non trovata' };
        }

        if (!data.attivo) {
            return { success: false, error: 'Account disattivato. Contatta l\'amministratore.' };
        }

        // Decodifica password (salvata in base64)
        const decodedPassword = atob(data.password);
        if (decodedPassword !== password) {
            return { success: false, error: 'Password errata' };
        }

        // Aggiorna ultimo accesso
        await supabaseClient
            .from('utenti')
            .update({ ultimo_accesso: new Date().toISOString() })
            .eq('id', data.id);

        // Registra log di accesso
        await this.registraLog(data.id, 'login', { email: data.email });

        return { success: true, utente: data };
    },

    // Registra log di sistema
    async registraLog(utenteId, azione, dettagli = {}) {
        const { error } = await supabaseClient
            .from('log_sistema')
            .insert([{
                utente_id: utenteId,
                azione,
                dettagli: JSON.stringify(dettagli),
                timestamp: new Date().toISOString()
            }]);

        if (error) console.error("Errore registrazione log:", error);
    },

    // Ottieni tutti gli utenti (solo Super Admin)
    async getUtenti() {
        const { data, error } = await supabaseClient
            .from('utenti')
            .select('*')
            .order('data_registrazione', { ascending: false });

        if (error) {
            console.error("Errore caricamento utenti:", error);
            return [];
        }

        return data;
    },

    // Ottieni un utente per ID
    async getUtente(id) {
        const { data, error } = await supabaseClient
            .from('utenti')
            .select('*')
            .eq('id', id)
            .single();

        if (error) {
            console.error("Errore caricamento utente:", error);
            return null;
        }

        return data;
    },

    // Crea un nuovo utente (solo Super Admin)
    async creaUtente(email, password, nome, ruolo, negozioId = null) {
        // Verifica se l'email esiste già
        const { data: existing, error: checkError } = await supabaseClient
            .from('utenti')
            .select('email')
            .eq('email', email)
            .single();

        if (existing) {
            return { success: false, error: 'Email già registrata' };
        }

        const { data, error } = await supabaseClient
            .from('utenti')
            .insert([{
                email,
                password: btoa(password),
                nome,
                ruolo,
                negozio_id: negozioId,
                attivo: true,
                data_registrazione: new Date().toISOString()
            }])
            .select();

        if (error) {
            console.error("Errore creazione utente:", error);
            return { success: false, error: error.message };
        }

        return { success: true, utente: data[0] };
    },

    // Aggiorna un utente
    async aggiornaUtente(id, updates) {
        // Rimuovi campi che non devono essere aggiornati
        delete updates.data_registrazione;
        delete updates.id;
        delete updates.ultimo_accesso;

        // Se password è presente, codificala
        if (updates.password) {
            updates.password = btoa(updates.password);
        }

        const { data, error } = await supabaseClient
            .from('utenti')
            .update(updates)
            .eq('id', id)
            .select();

        if (error) {
            console.error("Errore aggiornamento utente:", error);
            return { success: false, error: error.message };
        }

        return { success: true, utente: data[0] };
    },

    // Disattiva/attiva un utente
    async toggleAttivo(id, attivo) {
        const { error } = await supabaseClient
            .from('utenti')
            .update({ attivo })
            .eq('id', id);

        if (error) {
            console.error("Errore toggle utente:", error);
            return { success: false, error: error.message };
        }

        await this.registraLog(id, attivo ? 'attivato' : 'disattivato', {});
        return { success: true };
    },

    // Elimina un utente (solo Super Admin)
    async eliminaUtente(id) {
        const { error } = await supabaseClient
            .from('utenti')
            .delete()
            .eq('id', id);

        if (error) {
            console.error("Errore eliminazione utente:", error);
            return { success: false, error: error.message };
        }

        return { success: true };
    },

    // Ottieni log di sistema
    async getLogs(limite = 100) {
        const { data, error } = await supabaseClient
            .from('log_sistema')
            .select(`
                *,
                utenti:utente_id (nome, email)
            `)
            .order('timestamp', { ascending: false })
            .limit(limite);

        if (error) {
            console.error("Errore caricamento log:", error);
            return [];
        }

        return data;
    }
};

// ==========================================
// 7. FUNZIONI GLOBALI PER UTENTI MANAGER
// ==========================================

function caricaUtenteLoggato() {
    const utente = sessionStorage.getItem('utente_loggato');
    return utente ? JSON.parse(utente) : null;
}

function logoutUtente() {
    const utente = caricaUtenteLoggato();
    if (utente) {
        DB_UTENTI.registraLog(utente.id, 'logout', { email: utente.email });
    }
    sessionStorage.removeItem('utente_loggato');
    sessionStorage.removeItem('manager_autenticato');
    window.location.href = 'login-manager.html';
}

// Verifica se l'utente ha un permesso specifico
function haPermesso(permesso) {
    const utente = caricaUtenteLoggato();
    if (!utente) return false;
    
    const permessi = {
        'super_admin': [
            'gestione_utenti', 'gestione_ruoli', 'configurazione_sistema',
            'log_sistema', 'accesso_tutto'
        ],
        'admin_negozio': [
            'gestione_prodotti', 'gestione_prezzi', 'gestione_promozioni',
            'gestione_fornitori', 'gestione_ordini_acquisto', 'gestione_inventario',
            'report_vendite', 'segnalazione_esaurimento'
        ],
        'responsabile_acquisti': [
            'creazione_ordini_acquisto', 'gestione_fornitori_acquisti',
            'accesso_prezzi_acquisto'
        ],
        'analista': [
            'accesso_report', 'accesso_kpi', 'esportazione_dati'
        ]
    };
    
    return permessi[utente.ruolo]?.includes(permesso) || false;
}

// ==========================================
// 8. PERMESSI PER RUOLI
// ==========================================

const PERMESSI = {
    // Super Admin - Accesso totale
    GESTIONE_UTENTI: 'gestione_utenti',
    GESTIONE_RUOLI: 'gestione_ruoli',
    CONFIGURAZIONE_SISTEMA: 'configurazione_sistema',
    LOG_SISTEMA: 'log_sistema',
    ACCESSO_TUTTO: 'accesso_tutto',
    
    // Admin Negozio
    GESTIONE_PRODOTTI: 'gestione_prodotti',
    GESTIONE_PREZZI: 'gestione_prezzi',
    GESTIONE_PROMOZIONI: 'gestione_promozioni',
    GESTIONE_FORNITORI: 'gestione_fornitori',
    GESTIONE_ORDINI_ACQUISTO: 'gestione_ordini_acquisto',
    GESTIONE_INVENTARIO: 'gestione_inventario',
    REPORT_VENDITE: 'report_vendite',
    SEGNALAZIONE_ESURIMENTO: 'segnalazione_esaurimento',
    
    // Responsabile Acquisti
    CREAZIONE_ORDINI_ACQUISTO: 'creazione_ordini_acquisto',
    GESTIONE_FORNITORI_ACQUISTI: 'gestione_fornitori_acquisti',
    ACCESSO_PREZZI_ACQUISTO: 'accesso_prezzi_acquisto',
    
    // Analista
    ACCESSO_REPORT: 'accesso_report',
    ACCESSO_KPI: 'accesso_kpi',
    ESPORTAZIONE_DATI: 'esportazione_dati'
};

// Mappa ruoli -> permessi
const RUOLI_PERMESSI = {
    'super_admin': Object.values(PERMESSI),
    'admin_negozio': [
        PERMESSI.GESTIONE_PRODOTTI,
        PERMESSI.GESTIONE_PREZZI,
        PERMESSI.GESTIONE_PROMOZIONI,
        PERMESSI.GESTIONE_FORNITORI,
        PERMESSI.GESTIONE_ORDINI_ACQUISTO,
        PERMESSI.GESTIONE_INVENTARIO,
        PERMESSI.REPORT_VENDITE,
        PERMESSI.SEGNALAZIONE_ESURIMENTO
    ],
    'responsabile_acquisti': [
        PERMESSI.CREAZIONE_ORDINI_ACQUISTO,
        PERMESSI.GESTIONE_FORNITORI_ACQUISTI,
        PERMESSI.ACCESSO_PREZZI_ACQUISTO
    ],
    'analista': [
        PERMESSI.ACCESSO_REPORT,
        PERMESSI.ACCESSO_KPI,
        PERMESSI.ESPORTAZIONE_DATI
    ]
};

// Verifica se un utente ha un permesso specifico
function haPermesso(permesso) {
    const utente = caricaUtenteLoggato();
    if (!utente) return false;
    
    const permessiUtente = RUOLI_PERMESSI[utente.ruolo] || [];
    return permessiUtente.includes(permesso) || permessiUtente.includes(PERMESSI.ACCESSO_TUTTO);
}

// Verifica se un utente ha almeno uno dei permessi specificati
function haAlmenoUno(permessi) {
    return permessi.some(p => haPermesso(p));
}

// Verifica il ruolo dell'utente
function getRuolo() {
    const utente = caricaUtenteLoggato();
    return utente ? utente.ruolo : null;
}

function isSuperAdmin() {
    return getRuolo() === 'super_admin';
}

function isAdminNegozio() {
    return getRuolo() === 'admin_negozio';
}

function isResponsabileAcquisti() {
    return getRuolo() === 'responsabile_acquisti';
}

function isAnalista() {
    return getRuolo() === 'analista';
}