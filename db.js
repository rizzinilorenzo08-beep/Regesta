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

    async getBudget() {
        const { data, error } = await supabaseClient
            .from('configurazione')
            .select('valore')
            .eq('chiave', 'budgetAziendale')
            .single();
        if (error) return 67000.00;
        return parseFloat(data.valore);
    },

    async updateBudget(nuovoBudget) {
        const { error } = await supabaseClient
            .from('configurazione')
            .upsert({ chiave: 'budgetAziendale', valore: nuovoBudget.toFixed(2) });
        if (error) console.error("Errore nel salvataggio del budget:", error);
    },

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
// 3. FUNZIONI GLOBALI
// ==========================================

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

async function loadBudget() {
    return await DB.getBudget();
}

async function saveBudget(budget) {
    await DB.updateBudget(budget);
}

async function loadVendite() {
    return await DB.getVendite();
}

async function registraVendita(totale) {
    return await DB.registraVendita(totale);
}

function validaPasswordSicura(password) {
    const lettere = password.match(/[A-Za-z]/g) || [];
    const numeri = password.match(/\d/g) || [];

    if (lettere.length < 6) {
        return { valid: false, msg: 'La password deve contenere almeno 6 lettere.' };
    }
    if (!/[A-Z]/.test(password)) {
        return { valid: false, msg: 'La password deve contenere almeno una lettera maiuscola.' };
    }
    if (numeri.length < 2) {
        return { valid: false, msg: 'La password deve contenere almeno 2 numeri.' };
    }
    if (!/[^A-Za-z0-9]/.test(password)) {
        return { valid: false, msg: 'La password deve contenere almeno un carattere speciale.' };
    }

    return { valid: true, msg: '' };
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

const SALE_DURATION_MS = 1000 * 60 * 30;
const NEXT_SALE_DELAY_MS = 1000 * 60 * 5;
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
    const offertaDB = _offerteFlashDB.find(o => o.prodotto_id === item.id);
    if (offertaDB) return offertaDB.sconto;

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

function loadManagerCart() {
    return JSON.parse(localStorage.getItem(STORAGE_KEYS.managerCart) || '[]');
}
function saveManagerCart(cart) {
    localStorage.setItem(STORAGE_KEYS.managerCart, JSON.stringify(cart));
}
function clearManagerCart() {
    localStorage.removeItem(STORAGE_KEYS.managerCart);
}

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
    if (_offerteFlashDB.some(o => o.prodotto_id === item.id)) return true;
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
        const validazionePassword = validaPasswordSicura(password);
        if (!validazionePassword.valid) {
            return { success: false, error: validazionePassword.msg };
        }

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

    async verificaEmailCliente(email) {
        const { data, error } = await supabaseClient
            .from('clienti')
            .select('id, email, nome')
            .eq('email', email)
            .single();

        if (error || !data) {
            return { success: false, message: 'Email non trovata.' };
        }

        return { success: true, cliente: data };
    },

    async resetPasswordCliente(email, nuovaPassword) {
        const validazionePassword = validaPasswordSicura(nuovaPassword);
        if (!validazionePassword.valid) {
            return { success: false, message: validazionePassword.msg };
        }

        const { error } = await supabaseClient
            .from('clienti')
            .update({ password: btoa(nuovaPassword) })
            .eq('email', email);

        if (error) {
            console.error("Errore nel reset della password cliente:", error);
            return { success: false, message: error.message };
        }

        return { success: true };
    },

    async cambiaPasswordCliente(clienteId, passwordAttuale, nuovaPassword) {
        const validazionePassword = validaPasswordSicura(nuovaPassword);
        if (!validazionePassword.valid) {
            return { success: false, message: validazionePassword.msg };
        }

        const cliente = await this.getCliente(clienteId);
        if (!cliente) {
            return { success: false, message: 'Cliente non trovato.' };
        }

        if (atob(cliente.password) !== passwordAttuale) {
            return { success: false, message: 'Password attuale non corretta.' };
        }

        const { error } = await supabaseClient
            .from('clienti')
            .update({ password: btoa(nuovaPassword) })
            .eq('id', clienteId);

        if (error) {
            console.error("Errore nel cambio password cliente:", error);
            return { success: false, message: error.message };
        }

        return { success: true };
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
// 6. FUNZIONI PER VIAGGI IN PALIO
// ==========================================

const DB_VIAGGI = {
    async getViaggiAttivi() {
        const { data, error } = await supabaseClient
            .from('viaggi_in_palio')
            .select('*')
            .eq('attivo', true)
            .order('data_inserimento', { ascending: false });

        if (error) {
            console.error("Errore caricamento viaggi:", error);
            return [];
        }
        return data || [];
    },

    async getTuttiViaggi() {
        const { data, error } = await supabaseClient
            .from('viaggi_in_palio')
            .select('*')
            .order('data_inserimento', { ascending: false });

        if (error) {
            console.error("Errore caricamento viaggi:", error);
            return [];
        }
        return data || [];
    },

    async creaViaggio(titolo, descrizione, destinazione, dataPartenza, dataRitorno, creatoDa) {
        const { data, error } = await supabaseClient
            .from('viaggi_in_palio')
            .insert([{
                titolo,
                descrizione,
                destinazione,
                data_partenza: dataPartenza,
                data_ritorno: dataRitorno,
                attivo: true,
                creato_da: creatoDa
            }])
            .select();

        if (error) {
            console.error("Errore creazione viaggio:", error);
            return { success: false, error: error.message };
        }
        return { success: true, viaggio: data[0] };
    },

    async aggiornaViaggio(id, updates) {
        const { data, error } = await supabaseClient
            .from('viaggi_in_palio')
            .update(updates)
            .eq('id', id)
            .select();

        if (error) {
            console.error("Errore aggiornamento viaggio:", error);
            return { success: false, error: error.message };
        }
        return { success: true, viaggio: data[0] };
    },

    async eliminaViaggio(id) {
        const { error } = await supabaseClient
            .from('viaggi_in_palio')
            .delete()
            .eq('id', id);

        if (error) {
            console.error("Errore eliminazione viaggio:", error);
            return { success: false, error: error.message };
        }
        return { success: true };
    },

    async scegliViaggioCasuale() {
        const viaggi = await this.getViaggiAttivi();
        if (viaggi.length === 0) return null;
        return viaggi[Math.floor(Math.random() * viaggi.length)];
    },

    async registraVincita(clienteId, viaggioId, ordineId = null) {
        const codice = 'VIN-' + Date.now() + '-' + Math.random().toString(36).substring(2, 8).toUpperCase();
        
        const { data, error } = await supabaseClient
            .from('vincite_viaggi')
            .insert([{
                cliente_id: clienteId,
                viaggio_id: viaggioId,
                ordine_id: ordineId,
                codice_vincita: codice,
                riscattato: false
            }])
            .select();

        if (error) {
            console.error("Errore registrazione vincita:", error);
            return { success: false, error: error.message };
        }
        return { success: true, vincita: data[0] };
    },

    async verificaVincita() {
        return Math.random() < 0.001; // 1 su 1000
    },

    async getVinciteCliente(clienteId) {
        const { data, error } = await supabaseClient
            .from('vincite_viaggi')
            .select('*, viaggi_in_palio(*)')
            .eq('cliente_id', clienteId)
            .order('data_vincita', { ascending: false });

        if (error) {
            console.error("Errore caricamento vincite:", error);
            return [];
        }
        return data || [];
    },

    async riscattaVincita(vincitaId) {
        const { data, error } = await supabaseClient
            .from('vincite_viaggi')
            .update({ riscattato: true, data_riscatto: new Date().toISOString() })
            .eq('id', vincitaId)
            .select();

        if (error) {
            console.error("Errore riscatto vincita:", error);
            return { success: false, error: error.message };
        }
        return { success: true, vincita: data[0] };
    }
};

// ==========================================
// 7. FUNZIONI PER INDIRIZZI CLIENTE
// ==========================================

const DB_INDIRIZZI = {
    async salvaIndirizzo(clienteId, via, cap, citta, provincia, email = null, telefono = null, preferito = false) {
        const { data: existent, error: checkError } = await supabaseClient
            .from('indirizzi_cliente')
            .select('id, preferito')
            .eq('cliente_id', clienteId)
            .eq('via', via)
            .eq('cap', cap)
            .eq('citta', citta)
            .eq('provincia', provincia)
            .maybeSingle();

        if (existent) {
            const { data, error } = await supabaseClient
                .from('indirizzi_cliente')
                .update({ 
                    email: email || null,
                    telefono: telefono || null,
                    preferito: preferito || existent.preferito
                })
                .eq('id', existent.id)
                .select();
            
            if (error) return { success: false, error: error.message };
            return { success: true, indirizzo: data[0] };
        }

        if (preferito) {
            await supabaseClient
                .from('indirizzi_cliente')
                .update({ preferito: false })
                .eq('cliente_id', clienteId);
        }

        const { data, error } = await supabaseClient
            .from('indirizzi_cliente')
            .insert([{
                cliente_id: clienteId,
                via,
                cap,
                citta,
                provincia,
                email: email || null,
                telefono: telefono || null,
                preferito: preferito || false
            }])
            .select();

        if (error) {
            console.error("Errore salvataggio indirizzo:", error);
            return { success: false, error: error.message };
        }
        return { success: true, indirizzo: data[0] };
    },

    async getIndirizziCliente(clienteId) {
        const { data, error } = await supabaseClient
            .from('indirizzi_cliente')
            .select('*')
            .eq('cliente_id', clienteId)
            .order('preferito', { ascending: false })
            .order('data_inserimento', { ascending: false });

        if (error) {
            console.error("Errore caricamento indirizzi:", error);
            return [];
        }
        return data || [];
    },

    async getIndirizzoPreferito(clienteId) {
        const { data, error } = await supabaseClient
            .from('indirizzi_cliente')
            .select('*')
            .eq('cliente_id', clienteId)
            .eq('preferito', true)
            .maybeSingle();

        if (error) {
            console.error("Errore caricamento indirizzo preferito:", error);
            return null;
        }
        return data;
    },

    async eliminaIndirizzo(id, clienteId) {
        const { error } = await supabaseClient
            .from('indirizzi_cliente')
            .delete()
            .eq('id', id)
            .eq('cliente_id', clienteId);

        if (error) {
            console.error("Errore eliminazione indirizzo:", error);
            return { success: false, error: error.message };
        }
        return { success: true };
    },

    async setPreferito(id, clienteId) {
        await supabaseClient
            .from('indirizzi_cliente')
            .update({ preferito: false })
            .eq('cliente_id', clienteId);

        const { data, error } = await supabaseClient
            .from('indirizzi_cliente')
            .update({ preferito: true })
            .eq('id', id)
            .eq('cliente_id', clienteId)
            .select();

        if (error) {
            console.error("Errore impostazione preferito:", error);
            return { success: false, error: error.message };
        }
        return { success: true, indirizzo: data[0] };
    }
};

// ==========================================
// 8. FUNZIONI PER ORDINI E STATO CONSEGNA
// ==========================================

const DB_ORDINI = {
    async creaOrdine(clienteId, indirizzoData, metodoPagamento, totale, emailContatto) {
        const puntiGuadagnati = Math.floor(totale / 15);

        const giorni = Math.floor(Math.random() * 5) + 1;
        const consegnaPrevista = new Date();
        consegnaPrevista.setDate(consegnaPrevista.getDate() + giorni);

        const { data, error } = await supabaseClient
            .from('ordini')
            .insert([{
                cliente_id: clienteId,
                indirizzo_via: indirizzoData.via,
                indirizzo_cap: indirizzoData.cap,
                indirizzo_citta: indirizzoData.citta,
                indirizzo_provincia: indirizzoData.provincia,
                email_contatto: emailContatto,
                metodo_pagamento: metodoPagamento,
                totale: totale,
                punti_guadagnati: puntiGuadagnati,
                stato_consegna: 'in_elaborazione',
                data_consegna_prevista: consegnaPrevista.toISOString()
            }])
            .select();

        if (error) {
            console.error("Errore creazione ordine:", error);
            return { success: false, error: error.message };
        }

        return { success: true, ordine: data[0] };
    },

    async aggiornaStatoOrdine(ordineId, nuovoStato, note = null) {
        const updateData = { stato_consegna: nuovoStato };
        if (nuovoStato === 'consegnato') {
            updateData.data_consegna_effettiva = new Date().toISOString();
        }

        const { data, error } = await supabaseClient
            .from('ordini')
            .update(updateData)
            .eq('id', ordineId)
            .select();

        if (error) {
            console.error("Errore aggiornamento stato:", error);
            return { success: false, error: error.message };
        }

        if (note) {
            await supabaseClient
                .from('storico_stato_ordini')
                .insert([{
                    ordine_id: ordineId,
                    stato_nuovo: nuovoStato,
                    note: note
                }]);
        }

        return { success: true, ordine: data[0] };
    },

    async getOrdiniCliente(clienteId) {
        const { data, error } = await supabaseClient
            .from('ordini')
            .select('*')
            .eq('cliente_id', clienteId)
            .order('data_ordine', { ascending: false });

        if (error) {
            console.error("Errore caricamento ordini:", error);
            return [];
        }
        return data || [];
    },

    async getOrdine(ordineId) {
        const { data, error } = await supabaseClient
            .from('ordini')
            .select('*')
            .eq('id', ordineId)
            .single();

        if (error) {
            console.error("Errore caricamento ordine:", error);
            return null;
        }
        return data;
    },

    async getTuttiOrdini(limit = 100) {
        const { data, error } = await supabaseClient
            .from('ordini')
            .select('*, clienti(nome, email)')
            .order('data_ordine', { ascending: false })
            .limit(limit);

        if (error) {
            console.error("Errore caricamento ordini:", error);
            return [];
        }
        return data || [];
    },

    async getStoricoOrdine(ordineId) {
        const { data, error } = await supabaseClient
            .from('storico_stato_ordini')
            .select('*')
            .eq('ordine_id', ordineId)
            .order('data_cambio', { ascending: true });

        if (error) {
            console.error("Errore caricamento storico:", error);
            return [];
        }
        return data || [];
    },

    async simulaAvanzamentoConsegna() {
        const { data, error } = await supabaseClient
            .from('ordini')
            .select('*')
            .in('stato_consegna', ['in_elaborazione', 'spedito', 'in_transito', 'in_consegna']);

        if (error || !data) return;

        for (const ordine of data) {
            const dataOrdine = new Date(ordine.data_ordine);
            const giorniPassati = Math.floor((new Date() - dataOrdine) / (1000 * 60 * 60 * 24));
            
            let nuovoStato = ordine.stato_consegna;
            
            if (giorniPassati >= 0 && ordine.stato_consegna === 'in_elaborazione') {
                nuovoStato = 'spedito';
            } else if (giorniPassati >= 1 && ordine.stato_consegna === 'spedito') {
                nuovoStato = 'in_transito';
            } else if (giorniPassati >= 2 && ordine.stato_consegna === 'in_transito') {
                nuovoStato = 'in_consegna';
            } else if (giorniPassati >= 4 && ordine.stato_consegna === 'in_consegna') {
                nuovoStato = 'consegnato';
            }

            if (nuovoStato !== ordine.stato_consegna) {
                await this.aggiornaStatoOrdine(ordine.id, nuovoStato);
            }
        }
    }
};

// ==========================================
// 9. FUNZIONI GLOBALI PER CLIENTI
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
// 10. GESTIONE UTENTI E RUOLI (MANAGER)
// ==========================================

const DB_UTENTI = {
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

        const decodedPassword = atob(data.password);
        if (decodedPassword !== password) {
            return { success: false, error: 'Password errata' };
        }

        await supabaseClient
            .from('utenti')
            .update({ ultimo_accesso: new Date().toISOString() })
            .eq('id', data.id);

        await this.registraLog(data.id, 'login', { email: data.email });

        return { success: true, utente: data };
    },

    async verificaEmailUtente(email) {
        const { data, error } = await supabaseClient
            .from('utenti')
            .select('id, nome, email, attivo')
            .eq('email', email)
            .single();

        if (error || !data) {
            return { success: false, message: 'Email aziendale non trovata.' };
        }

        if (!data.attivo) {
            return { success: false, message: 'Account disattivato. Contatta un amministratore.' };
        }

        return { success: true, utente: data };
    },

    async resetPasswordUtente(email, nuovaPassword) {
        const { data, error } = await supabaseClient
            .from('utenti')
            .update({ password: btoa(nuovaPassword) })
            .eq('email', email)
            .select('id, nome, email')
            .single();

        if (error || !data) {
            return { success: false, message: error ? error.message : 'Utente non trovato.' };
        }

        await this.registraLog(data.id, 'reset_password_manager', { email: data.email });
        return { success: true, utente: data };
    },

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

    async creaUtente(email, password, nome, ruolo, negozioId = null) {
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

    async aggiornaUtente(id, updates) {
        delete updates.data_registrazione;
        delete updates.id;
        delete updates.ultimo_accesso;

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
// 11. FUNZIONI GLOBALI PER UTENTI MANAGER
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
    window.location.href = 'index.html';
}

// ==========================================
// 12. PERMESSI PER RUOLI
// ==========================================

const PERMESSI = {
    GESTIONE_UTENTI: 'gestione_utenti',
    GESTIONE_RUOLI: 'gestione_ruoli',
    CONFIGURAZIONE_SISTEMA: 'configurazione_sistema',
    LOG_SISTEMA: 'log_sistema',
    ACCESSO_TUTTO: 'accesso_tutto',
    GESTIONE_PRODOTTI: 'gestione_prodotti',
    GESTIONE_PREZZI: 'gestione_prezzi',
    GESTIONE_PROMOZIONI: 'gestione_promozioni',
    GESTIONE_FORNITORI: 'gestione_fornitori',
    GESTIONE_ORDINI_ACQUISTO: 'gestione_ordini_acquisto',
    GESTIONE_INVENTARIO: 'gestione_inventario',
    REPORT_VENDITE: 'report_vendite',
    SEGNALAZIONE_ESURIMENTO: 'segnalazione_esaurimento',
    CREAZIONE_ORDINI_ACQUISTO: 'creazione_ordini_acquisto',
    GESTIONE_FORNITORI_ACQUISTI: 'gestione_fornitori_acquisti',
    ACCESSO_PREZZI_ACQUISTO: 'accesso_prezzi_acquisto',
    ACCESSO_REPORT: 'accesso_report',
    ACCESSO_KPI: 'accesso_kpi',
    ESPORTAZIONE_DATI: 'esportazione_dati'
};

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

function haPermesso(permesso) {
    const utente = caricaUtenteLoggato();
    if (!utente) return false;
    const permessiUtente = RUOLI_PERMESSI[utente.ruolo] || [];
    return permessiUtente.includes(permesso) || permessiUtente.includes(PERMESSI.ACCESSO_TUTTO);
}

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

// ==========================================
// 13. GESTIONE PREMI (CATALOGO PREMI)
// ==========================================

const DB_PREMI = {
    async getPremi() {
        const { data, error } = await supabaseClient
            .from('catalogo_premi')
            .select('*')
            .order('punti_richiesti', { ascending: true });

        if (error) {
            console.error("Errore caricamento catalogo premi:", error);
            return [];
        }
        return data || [];
    },

    async creaPremio(nome, descrizione, puntiRichiesti, prezzoAggiuntivo, icona = '🎁') {
        const { data, error } = await supabaseClient
            .from('catalogo_premi')
            .insert([{
                nome,
                descrizione,
                punti_richiesti: puntiRichiesti,
                prezzo_aggiuntivo: prezzoAggiuntivo || 0,
                icona: icona || '🎁'
            }])
            .select();

        if (error) {
            console.error("Errore creazione premio:", error);
            return { success: false, error: error.message };
        }
        return { success: true, premio: data[0] };
    },

    async aggiornaPremio(id, updates) {
        const { data, error } = await supabaseClient
            .from('catalogo_premi')
            .update(updates)
            .eq('id', id)
            .select();

        if (error) {
            console.error("Errore aggiornamento premio:", error);
            return { success: false, error: error.message };
        }
        return { success: true, premio: data[0] };
    },

    async eliminaPremio(id) {
        const { error } = await supabaseClient
            .from('catalogo_premi')
            .delete()
            .eq('id', id);

        if (error) {
            console.error("Errore eliminazione premio:", error);
            return { success: false, error: error.message };
        }
        return { success: true };
    },

    async riscattaPremio(clienteId, premioId) {
        const { data: premio, error: premioError } = await supabaseClient
            .from('catalogo_premi')
            .select('*')
            .eq('id', premioId)
            .single();

        if (premioError || !premio) {
            return { success: false, error: 'Premio non trovato' };
        }

        const { data: cliente, error: clienteError } = await supabaseClient
            .from('clienti')
            .select('punti_spesa')
            .eq('id', clienteId)
            .single();

        if (clienteError || !cliente) {
            return { success: false, error: 'Cliente non trovato' };
        }

        if (cliente.punti_spesa < premio.punti_richiesti) {
            return { success: false, error: 'Punti insufficienti' };
        }

        const nuoviPunti = cliente.punti_spesa - premio.punti_richiesti;
        const { error: updateError } = await supabaseClient
            .from('clienti')
            .update({ punti_spesa: nuoviPunti })
            .eq('id', clienteId);

        if (updateError) {
            return { success: false, error: updateError.message };
        }

        const { error: insertError } = await supabaseClient
            .from('premi_riscattati')
            .insert([{
                cliente_id: clienteId,
                premio_id: premioId,
                punti_utilizzati: premio.punti_richiesti,
                data_riscatto: new Date().toISOString()
            }]);

        if (insertError) {
            console.error("Errore registrazione riscatto premio:", insertError);
            await supabaseClient
                .from('clienti')
                .update({ punti_spesa: cliente.punti_spesa })
                .eq('id', clienteId);
            return { success: false, error: insertError.message };
        }

        return { 
            success: true, 
            premio: premio,
            puntiRimanenti: nuoviPunti 
        };
    },

    async getPremiRiscattati(clienteId) {
        const { data, error } = await supabaseClient
            .from('premi_riscattati')
            .select(`
                *,
                premio:catalogo_premi(*)
            `)
            .eq('cliente_id', clienteId)
            .order('data_riscatto', { ascending: false });

        if (error) {
            console.error("Errore caricamento premi riscattati:", error);
            return [];
        }
        return data || [];
    }
};

// ==========================================
// 14. AI CHATBOT CON GOOGLE GEMINI
// ==========================================

const AI_CHATBOT = {
    model: 'gemini-2.0-flash-exp',
    
    getApiKey() {
        return localStorage.getItem('gemini_api_key') || '';
    },
    
    buildContext(inventario, vendite, expenses, ordini) {
        let context = `Sei un assistente AI per un supermercato chiamato SinGo. 
Devi aiutare il manager con consigli su acquisti, prezzi, scorte e offerte.

DATI ATUALI DEL NEGOZIO:
- Prodotti in inventario: ${inventario.length}
- Vendite totali: ${vendite.length}
- Ordini totali: ${ordini ? ordini.length : 0}

PRODOTTI DISPONIBILI:
`;

        inventario.forEach(p => {
            const perc = Math.round((p.qty / p.maxQty) * 100);
            context += `- ${p.nome} (${p.cat}): ${p.qty}/${p.maxQty} unità (${perc}%), prezzo €${p.prezzo.toFixed(2)}\n`;
        });

        if (vendite.length > 0) {
            const incasso = vendite.reduce((s, v) => s + v.totale, 0);
            context += `\nINCASSO TOTALE: €${incasso.toFixed(2)}\n`;
        }

        if (expenses.length > 0) {
            const spese = expenses.reduce((s, e) => s + e.totale, 0);
            context += `SPESE TOTALI: €${spese.toFixed(2)}\n`;
        }

        const serie = this.getSerieEconomiche(vendite, expenses, ordini || []);
        const trendFatturato = this.descriviTrend(serie.revenue);
        const trendMargine = this.descriviTrend(serie.margin);
        const trendOrdini = this.descriviTrend(serie.orders);
        const trendAov = this.descriviTrend(serie.aov);
        const statiOrdini = this.getStatoOrdini(ordini || []);
        const leadTimeMedio = this.getLeadTimeMedio(ordini || []);
        const consigliPrezzo = this.getConsigliPrezzo(inventario);

        context += `\nDATI GRAFICI E TREND:
- Fatturato: ${trendFatturato.testo} (${trendFatturato.delta.toFixed(1)}%)
- Margine: ${trendMargine.testo} (${trendMargine.delta.toFixed(1)}%)
- Ordini: ${trendOrdini.testo} (${trendOrdini.delta.toFixed(1)}%)
- AOV: ${trendAov.testo} (${trendAov.delta.toFixed(1)}%)
- Lead time medio: ${leadTimeMedio.toFixed(1)} giorni
- Stato ordini: ${statiOrdini.map(s => `${s.label} ${s.count}`).join(', ')}

CONSIGLI PREZZO CALCOLATI:
${consigliPrezzo.slice(0, 8).map(p => `- ${p.nome}: ${p.tipo}, prezzo attuale €${p.prezzo.toFixed(2)}, suggerito €${p.nuovoPrezzo.toFixed(2)}, stock ${p.percentuale}%, domanda stimata ${Math.round(p.domanda * 100)}%`).join('\n')}
`;

        const prodottiCritici = inventario.filter(p => (p.qty / p.maxQty) * 100 < 20);
        if (prodottiCritici.length > 0) {
            context += `\n⚠️ PRODOTTI IN ESAURIMENTO:\n`;
            prodottiCritici.forEach(p => {
                context += `- ${p.nome}: ${p.qty}/${p.maxQty}\n`;
            });
        }

        context += `
REGOLE: 1 punto ogni 15€, margine consigliato 45%. Rispondi in ITALIANO, usa emoji.
`;

        return context;
    },

    async chat(messaggio, inventario, vendite, expenses, ordini) {
        const apiKey = this.getApiKey();
        
        if (!apiKey) {
            return {
                success: false,
                error: '❌ Configura la chiave Gemini nelle impostazioni AI.',
                fallback: this.generaRispostaFallback(messaggio, inventario, vendite, expenses, ordini)
            };
        }

        const context = this.buildContext(inventario, vendite, expenses, ordini);

        try {
            const url = `https://generativelanguage.googleapis.com/v1beta/models/${this.model}:generateContent?key=${apiKey}`;
            
            const response = await fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    contents: [{
                        parts: [
                            { text: context },
                            { text: `Domanda del manager: ${messaggio}` }
                        ]
                    }],
                    generationConfig: {
                        temperature: 0.7,
                        maxOutputTokens: 600
                    }
                })
            });

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.error?.message || 'Errore API Gemini');
            }

            const data = await response.json();
            const risposta = data.candidates?.[0]?.content?.parts?.[0]?.text || '⚠️ Nessuna risposta.';

            return { success: true, risposta };

        } catch (error) {
            console.error('Gemini Error:', error);
            return {
                success: false,
                error: error.message,
                fallback: this.generaRispostaFallback(messaggio, inventario, vendite, expenses, ordini)
            };
        }
    },

    normalizzaTesto(testo) {
        return String(testo || '')
            .toLowerCase()
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '');
    },

    contieneUno(testo, parole) {
        return parole.some(parola => testo.includes(parola));
    },

    getMaxQty(prodotto) {
        return Number(prodotto.maxQty || prodotto.max_qty || 0);
    },

    getPercentualeScorta(prodotto) {
        const maxQty = this.getMaxQty(prodotto);
        if (maxQty <= 0) return 0;
        return Math.round((Number(prodotto.qty || 0) / maxQty) * 100);
    },

    getProdottiBassi(inventario, soglia = 25) {
        return inventario
            .map(p => ({ ...p, percentuale: this.getPercentualeScorta(p), maxQtyNormalizzato: this.getMaxQty(p) }))
            .filter(p => p.maxQtyNormalizzato > 0 && p.percentuale <= soglia)
            .sort((a, b) => a.percentuale - b.percentuale);
    },

    getTopProdottiStimati(inventario) {
        return inventario
            .map(p => {
                const maxQty = this.getMaxQty(p);
                const qty = Number(p.qty || 0);
                const vendutiStimati = Math.max(0, maxQty - qty);
                return {
                    ...p,
                    vendutiStimati,
                    valoreStimato: vendutiStimati * Number(p.prezzo || 0),
                    percentuale: this.getPercentualeScorta(p)
                };
            })
            .filter(p => p.vendutiStimati > 0)
            .sort((a, b) => b.valoreStimato - a.valoreStimato);
    },

    dateKey(data) {
        if (!data) return new Date().toISOString().slice(0, 10);
        const parsed = new Date(data);
        if (isNaN(parsed)) return String(data).slice(0, 10);
        return parsed.toISOString().slice(0, 10);
    },

    mediaValori(valori) {
        if (!valori.length) return 0;
        return valori.reduce((s, v) => s + Number(v || 0), 0) / valori.length;
    },

    descriviTrend(valori) {
        if (valori.length < 2) return { testo: 'stabile', delta: 0, ultimo: valori[0] || 0 };
        const meta = Math.max(1, Math.floor(valori.length / 2));
        const prima = this.mediaValori(valori.slice(0, meta));
        const dopo = this.mediaValori(valori.slice(-meta));
        const delta = prima > 0 ? ((dopo - prima) / prima) * 100 : (dopo > 0 ? 100 : 0);
        let testo = 'stabile';
        if (delta > 8) testo = 'in crescita';
        if (delta < -8) testo = 'in calo';
        return { testo, delta, ultimo: valori[valori.length - 1] || 0 };
    },

    getSerieEconomiche(vendite, expenses, ordini = []) {
        const perData = {};
        const dateConVendite = new Set(vendite.map(v => this.dateKey(v.data)));

        vendite.forEach(v => {
            const d = this.dateKey(v.data);
            if (!perData[d]) perData[d] = { revenue: 0, costs: 0, orders: 0 };
            perData[d].revenue += Number(v.totale || 0);
            if (!ordini.length) perData[d].orders += 1;
        });

        expenses.forEach(e => {
            const d = this.dateKey(e.data);
            if (!perData[d]) perData[d] = { revenue: 0, costs: 0, orders: 0 };
            perData[d].costs += Number(e.totale || 0);
        });

        ordini.forEach(o => {
            const d = this.dateKey(o.data_ordine);
            if (!perData[d]) perData[d] = { revenue: 0, costs: 0, orders: 0 };
            if (!dateConVendite.has(d)) perData[d].revenue += Number(o.totale || 0);
            perData[d].orders += 1;
        });

        const labels = Object.keys(perData).sort();
        return {
            labels,
            revenue: labels.map(d => perData[d].revenue),
            margin: labels.map(d => perData[d].revenue - perData[d].costs),
            orders: labels.map(d => perData[d].orders),
            aov: labels.map(d => perData[d].orders ? perData[d].revenue / perData[d].orders : 0)
        };
    },

    getStatoOrdini(ordini = []) {
        const labels = {
            in_elaborazione: 'in elaborazione',
            spedito: 'spediti',
            in_transito: 'in transito',
            in_consegna: 'in consegna',
            consegnato: 'consegnati'
        };
        return Object.keys(labels).map(key => ({
            key,
            label: labels[key],
            count: ordini.filter(o => o.stato_consegna === key).length
        }));
    },

    getLeadTimeMedio(ordini = []) {
        const giorni = ordini
            .map(o => {
                const start = o.data_ordine ? new Date(o.data_ordine) : null;
                const endValue = o.data_consegna_effettiva || (o.stato_consegna === 'consegnato' ? o.data_consegna_prevista : null);
                const end = endValue ? new Date(endValue) : null;
                if (!start || !end || isNaN(start) || isNaN(end)) return null;
                return Math.max(0, (end - start) / (1000 * 60 * 60 * 24));
            })
            .filter(v => v !== null);
        return this.mediaValori(giorni);
    },

    getConsigliPrezzo(inventario) {
        const categorie = {};
        inventario.forEach(p => {
            const cat = p.cat || 'Altro';
            if (!categorie[cat]) categorie[cat] = [];
            categorie[cat].push(Number(p.prezzo || 0));
        });
        const prezzoMedioCategoria = {};
        Object.keys(categorie).forEach(cat => {
            prezzoMedioCategoria[cat] = this.mediaValori(categorie[cat]);
        });

        return inventario
            .map(p => {
                const maxQty = this.getMaxQty(p);
                const qty = Number(p.qty || 0);
                const prezzo = Number(p.prezzo || 0);
                const percentuale = this.getPercentualeScorta(p);
                const vendutiStimati = Math.max(0, maxQty - qty);
                const domanda = maxQty > 0 ? vendutiStimati / maxQty : 0;
                const mediaCat = prezzoMedioCategoria[p.cat || 'Altro'] || prezzo;
                const tensione = domanda * 100 - percentuale;
                let tipo = 'mantieni';
                let variazione = 0;

                if (domanda >= 0.65 && percentuale <= 35) {
                    tipo = 'alza';
                    variazione = percentuale <= 15 ? 0.12 : 0.08;
                } else if (domanda <= 0.30 && percentuale >= 65) {
                    tipo = 'abbassa';
                    variazione = -0.10;
                } else if (domanda >= 0.50 && prezzo < mediaCat * 0.9) {
                    tipo = 'alza';
                    variazione = 0.06;
                }

                return {
                    ...p,
                    prezzo,
                    percentuale,
                    vendutiStimati,
                    domanda,
                    mediaCat,
                    tensione,
                    tipo,
                    nuovoPrezzo: Number((prezzo * (1 + variazione)).toFixed(2)),
                    variazione
                };
            })
            .sort((a, b) => b.tensione - a.tensione);
    },

    generaRispostaFallback(messaggio, inventario, vendite, expenses, ordini = []) {
        const msg = this.normalizzaTesto(messaggio);
        const incasso = vendite.reduce((s, v) => s + Number(v.totale || 0), 0);
        const spese = expenses.reduce((s, e) => s + Number(e.totale || 0), 0);
        const margine = incasso - spese;
        const scorteTotali = inventario.reduce((s, p) => s + Number(p.qty || 0), 0);
        const prodottiBassi = this.getProdottiBassi(inventario);
        const topStimati = this.getTopProdottiStimati(inventario);
        const serie = this.getSerieEconomiche(vendite, expenses, ordini);
        const trendFatturato = this.descriviTrend(serie.revenue);
        const trendMargine = this.descriviTrend(serie.margin);
        const trendOrdini = this.descriviTrend(serie.orders);
        const trendAov = this.descriviTrend(serie.aov);
        const statiOrdini = this.getStatoOrdini(ordini);
        const leadTimeMedio = this.getLeadTimeMedio(ordini);
        const consigliPrezzo = this.getConsigliPrezzo(inventario);

        const chiedeSaluto = /^(ciao|buongiorno|buonasera|salve|hey)\b/.test(msg);
        const chiedeAcquisti = this.contieneUno(msg, ['comprare', 'acquistare', 'rifornire', 'ordinare', 'cosa dovrei comprare', 'cosa comprare']);
        const chiedeScorte = this.contieneUno(msg, ['scorte', 'stock', 'giacenze', 'esaurimento', 'scarsi', 'basse', 'manca', 'mancano']);
        const chiedePrezzi = this.contieneUno(msg, ['prezzo', 'prezzi', 'margine', 'margini', 'analisi prezzi', 'analizza', 'alzare', 'abbassare', 'a quanto']);
        const chiedePrezzoSpecifico = this.contieneUno(msg, ['alzare', 'abbassare', 'a quanto', 'modificare il prezzo', 'cambiare il prezzo']);
        const chiedeVendite = this.contieneUno(msg, ['vendono', 'vendite', 'venduti', 'top', 'migliori', 'meglio', 'richiesti']);
        const chiedeSituazione = this.contieneUno(msg, ['riassunto', 'situazione', 'come va', 'andamento', 'negozio', 'bilancio', 'incasso']);
        const chiedeGrafici = this.contieneUno(msg, ['grafico', 'grafici', 'dedurre', 'capire', 'previsione', 'futuro', 'trend']);
        const chiedeOrdini = this.contieneUno(msg, ['ordine', 'ordini', 'consegna', 'consegne', 'spediti', 'transito', 'elaborazione']);
        const chiedeOfferte = this.contieneUno(msg, ['offerte', 'promozioni', 'sconti', 'promo']);

        if (chiedeOrdini) {
            const totaleOrdini = ordini ? ordini.length : 0;
            const nonConsegnati = statiOrdini
                .filter(s => s.key !== 'consegnato' && s.count > 0)
                .map(s => `${s.count} ${s.label}`);

            let risposta = `🚚 **Stato ordini**\n\n`;
            risposta += `• Ordini totali analizzati: ${totaleOrdini}\n`;
            statiOrdini.forEach(s => {
                risposta += `• ${s.label}: ${s.count}\n`;
            });
            if (leadTimeMedio > 0) {
                risposta += `• Tempo medio di consegna stimato: ${leadTimeMedio.toFixed(1)} giorni\n`;
            }
            risposta += `\nCosa deduco:\n`;
            if (nonConsegnati.length > 0) {
                risposta += `• Hai ancora ordini aperti: ${nonConsegnati.join(', ')}.\n`;
                risposta += `• Priorita: controlla prima quelli in elaborazione e in transito, per evitare ritardi percepiti dal cliente.\n`;
            } else if (totaleOrdini > 0) {
                risposta += `• Gli ordini risultano tutti consegnati: bene per affidabilita e servizio.\n`;
            } else {
                risposta += `• Non vedo ordini da analizzare in questo momento.\n`;
            }
            return risposta.trim();
        }

        if (chiedeGrafici) {
            let risposta = `📈 **Lettura dei grafici**\n\n`;
            risposta += `• Fatturato: ${trendFatturato.testo} (${trendFatturato.delta.toFixed(1)}%).\n`;
            risposta += `• Margine: ${trendMargine.testo} (${trendMargine.delta.toFixed(1)}%).\n`;
            risposta += `• Numero ordini: ${trendOrdini.testo} (${trendOrdini.delta.toFixed(1)}%).\n`;
            risposta += `• Valore medio ordine: ${trendAov.testo} (${trendAov.delta.toFixed(1)}%).\n`;
            if (leadTimeMedio > 0) risposta += `• Lead time medio: ${leadTimeMedio.toFixed(1)} giorni.\n`;

            risposta += `\nCosa puoi dedurre:\n`;
            if (trendFatturato.delta > 8 && trendMargine.delta > 8) {
                risposta += `• La crescita sembra sana: vendite e margine si muovono insieme.\n`;
            } else if (trendFatturato.delta > 8 && trendMargine.delta <= 0) {
                risposta += `• Stai vendendo di piu, ma il margine non segue: controlla sconti e costi di rifornimento.\n`;
            } else if (trendFatturato.delta < -8) {
                risposta += `• Il fatturato e in calo: servono promo mirate sui prodotti con scorta alta e recupero dei prodotti sotto stock.\n`;
            } else {
                risposta += `• L'andamento e abbastanza stabile: puoi ottimizzare prezzi e scorte senza mosse aggressive.\n`;
            }

            risposta += `\nPrevisione semplice:\n`;
            if (trendFatturato.delta > 8) {
                risposta += `• Se il trend continua, il prossimo periodo dovrebbe chiudere sopra la media recente. Rischio principale: rottura stock sui prodotti piu richiesti.\n`;
            } else if (trendFatturato.delta < -8) {
                risposta += `• Se non intervieni, il prossimo periodo potrebbe restare sotto media. Azione: promo su scorte alte e rifornimento immediato dei prodotti critici.\n`;
            } else {
                risposta += `• Mi aspetto un periodo simile all'attuale. Azione: piccoli test prezzo, non cambi drastici.\n`;
            }
            return risposta.trim();
        }

        if (chiedePrezzoSpecifico) {
            const daAlzare = consigliPrezzo.filter(p => p.tipo === 'alza' && p.prezzo > 0).slice(0, 5);
            const daAbbassare = consigliPrezzo.filter(p => p.tipo === 'abbassa' && p.prezzo > 0).slice(0, 3);

            if (daAlzare.length === 0 && daAbbassare.length === 0) {
                return `💰 **Prezzi: nessuna modifica forte**\n\nNon vedo un prodotto con segnali abbastanza chiari per un aumento netto. Per ora mantieni i prezzi e lavora su rifornimento e promozioni mirate.`;
            }

            let risposta = `💰 **Prezzi consigliati**\n\n`;
            if (daAlzare.length > 0) {
                risposta += `Prodotti da aumentare con priorita:\n`;
                daAlzare.forEach(p => {
                    const variazione = Math.round(p.variazione * 100);
                    risposta += `• ${p.nome}: da €${p.prezzo.toFixed(2)} a €${p.nuovoPrezzo.toFixed(2)} (+${variazione}%). Stock ${p.percentuale}%, domanda stimata ${Math.round(p.domanda * 100)}%.\n`;
                });
            }

            if (daAbbassare.length > 0) {
                risposta += `\nProdotti da abbassare o mettere in promo:\n`;
                daAbbassare.forEach(p => {
                    risposta += `• ${p.nome}: da €${p.prezzo.toFixed(2)} a €${p.nuovoPrezzo.toFixed(2)}. Stock ${p.percentuale}%, domanda stimata ${Math.round(p.domanda * 100)}%.\n`;
                });
            }

            risposta += `\nRegola pratica: aumenta solo 5-12% e poi osserva vendite e scorte per qualche giorno.`;
            return risposta.trim();
        }

        if (chiedePrezzi) {
            const prezzoMedio = inventario.length > 0
                ? inventario.reduce((s, p) => s + Number(p.prezzo || 0), 0) / inventario.length
                : 0;
            const prodottiCostosi = [...inventario]
                .sort((a, b) => Number(b.prezzo || 0) - Number(a.prezzo || 0))
                .slice(0, 5);
            const prodottiDaSpingere = inventario
                .filter(p => this.getPercentualeScorta(p) > 60)
                .sort((a, b) => Number(b.qty || 0) - Number(a.qty || 0))
                .slice(0, 4);

            let risposta = `💰 **Analisi prezzi**\n\n`;
            risposta += `• Prezzo medio catalogo: €${prezzoMedio.toFixed(2)}\n`;
            risposta += `• Margine attuale stimato: €${margine.toFixed(2)}\n`;
            risposta += `• Regola consigliata: mantieni circa il 45% di margine sugli acquisti.\n\n`;

            if (prodottiCostosi.length > 0) {
                risposta += `Prodotti con prezzo piu alto:\n`;
                prodottiCostosi.forEach(p => {
                    risposta += `• ${p.nome}: €${Number(p.prezzo || 0).toFixed(2)}\n`;
                });
            }

            if (prodottiDaSpingere.length > 0) {
                risposta += `\nAzioni consigliate:\n`;
                risposta += `• Fai promo leggere sui prodotti con molte scorte: ${prodottiDaSpingere.map(p => p.nome).join(', ')}.\n`;
                risposta += `• Non abbassare i prezzi dei prodotti sotto scorta: prima riforniscili.\n`;
            }

            const primoAumento = consigliPrezzo.find(p => p.tipo === 'alza' && p.prezzo > 0);
            const primoRibasso = consigliPrezzo.find(p => p.tipo === 'abbassa' && p.prezzo > 0);
            if (primoAumento || primoRibasso) {
                risposta += `\nModifiche prezzo specifiche:\n`;
                if (primoAumento) {
                    risposta += `• Alza ${primoAumento.nome}: €${primoAumento.prezzo.toFixed(2)} -> €${primoAumento.nuovoPrezzo.toFixed(2)}.\n`;
                }
                if (primoRibasso) {
                    risposta += `• Promo su ${primoRibasso.nome}: €${primoRibasso.prezzo.toFixed(2)} -> €${primoRibasso.nuovoPrezzo.toFixed(2)}.\n`;
                }
            }

            return risposta.trim();
        }

        if (chiedeAcquisti || chiedeScorte) {
            if (prodottiBassi.length === 0) {
                return `✅ **Scorte sotto controllo**\n\nNon vedo prodotti sotto la soglia critica. Puoi rimandare gli acquisti urgenti e concentrarti su offerte o analisi prezzi.`;
            }

            let risposta = chiedeAcquisti ? `📦 **Consiglio rifornimento**\n\n` : `⚠️ **Prodotti con scorte basse**\n\n`;
            risposta += `Priorita da gestire:\n`;
            prodottiBassi.slice(0, 8).forEach(p => {
                const daComprare = Math.max(0, p.maxQtyNormalizzato - Number(p.qty || 0));
                risposta += `• ${p.nome}: ${p.qty}/${p.maxQtyNormalizzato} (${p.percentuale}%), compra circa ${daComprare} unita\n`;
            });

            risposta += `\nAzione: parti dai prodotti sotto il 20%, poi completa quelli tra 20% e 25%.`;
            return risposta;
        }

        if (chiedeVendite) {
            if (topStimati.length === 0) {
                return `🏆 **Top vendite**\n\nNon ho abbastanza storico per capire quali prodotti vendono meglio. Al momento posso stimarlo solo dal consumo dello stock.`;
            }

            let risposta = `🏆 **Prodotti che sembrano vendere meglio**\n\n`;
            risposta += `Stima basata su stock consumato, non su righe ordine dettagliate:\n`;
            topStimati.slice(0, 6).forEach(p => {
                risposta += `• ${p.nome}: circa ${p.vendutiStimati} pezzi venduti, valore stimato €${p.valoreStimato.toFixed(2)}\n`;
            });
            risposta += `\nSuggerimento: tieni questi prodotti sempre disponibili e valuta promo solo se la scorta e alta.`;
            return risposta;
        }

        if (chiedeSituazione) {
            let risposta = `📊 **Riassunto negozio**\n\n`;
            risposta += `• Incasso: €${incasso.toFixed(2)}\n`;
            risposta += `• Spese: €${spese.toFixed(2)}\n`;
            risposta += `• Margine: €${margine.toFixed(2)}\n`;
            risposta += `• Ordini registrati: ${ordini ? ordini.length : 0}\n`;
            risposta += `• Scorte totali: ${scorteTotali} unita\n`;
            risposta += `• Prodotti sotto soglia: ${prodottiBassi.length}\n`;
            risposta += `• Trend fatturato: ${trendFatturato.testo} (${trendFatturato.delta.toFixed(1)}%)\n`;
            risposta += `• Trend ordini: ${trendOrdini.testo} (${trendOrdini.delta.toFixed(1)}%)\n`;

            if (prodottiBassi.length > 0) {
                risposta += `\nPrima azione consigliata: rifornisci ${prodottiBassi.slice(0, 3).map(p => p.nome).join(', ')}.`;
            }

            return risposta;
        }

        if (chiedeOfferte) {
            const candidatiPromo = inventario
                .filter(p => this.getPercentualeScorta(p) >= 60)
                .sort((a, b) => this.getPercentualeScorta(b) - this.getPercentualeScorta(a))
                .slice(0, 5);

            if (candidatiPromo.length === 0) {
                return `🎁 **Offerte e promozioni**\n\nNon vedo prodotti con scorte molto alte. Prima sistema il rifornimento, poi conviene creare promo mirate.`;
            }

            let risposta = `🎁 **Idee promozione**\n\n`;
            risposta += `Puoi spingere prodotti con scorta alta:\n`;
            candidatiPromo.forEach(p => {
                risposta += `• ${p.nome}: ${p.qty}/${this.getMaxQty(p)} (${this.getPercentualeScorta(p)}%)\n`;
            });
            risposta += `\nSconto consigliato: 10-15%, evitando i prodotti sotto scorta.`;
            return risposta;
        }

        if (chiedeSaluto) {
            return `🤖 **Ciao! Sono l'assistente AI di SinGo.**\n\nChiedimi pure cose tipo: "analisi prezzi", "scorte basse", "top vendite", "cosa dovrei comprare" o "come va il negozio".`;
        }

        return `🤖 **Posso aiutarti sui dati del negozio.**\n\nNon ho capito bene la richiesta, ma posso rispondere su acquisti, prezzi, scorte, offerte, vendite e situazione generale.\n\nEsempi: "Quali prodotti hanno scorte basse?", "Fammi un'analisi dei prezzi", "Quali prodotti vendono meglio?".`;
    }
};
