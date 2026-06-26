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

    async verificaEmailCliente(email) {
        const { data, error } = await supabaseClient
            .from('clienti')
            .select('id, email, nome')
            .eq('email', email)
            .single();

        if (error || !data) {
            return { success: false, message: 'Email non trovata' };
        }

        return { success: true, cliente: data };
    },

    async resetPasswordCliente(email, nuovaPassword) {
        // Cerca il cliente per email
        const { data: cliente, error: findError } = await supabaseClient
            .from('clienti')
            .select('id')
            .eq('email', email)
            .single();

        if (findError || !cliente) {
            return { success: false, message: 'Email non trovata' };
        }

        // Aggiorna la password
        const { error: updateError } = await supabaseClient
            .from('clienti')
            .update({ password: btoa(nuovaPassword) })
            .eq('id', cliente.id);

        if (updateError) {
            console.error("Errore reset password:", updateError);
            return { success: false, message: updateError.message };
        }

        return { success: true, message: 'Password aggiornata con successo' };
    },

    async cambiaPasswordCliente(clienteId, passwordAttuale, nuovaPassword) {
        const { data: cliente, error: findError } = await supabaseClient
            .from('clienti')
            .select('id, password')
            .eq('id', clienteId)
            .single();

        if (findError || !cliente) {
            return { success: false, message: 'Cliente non trovato' };
        }

        if (atob(cliente.password) !== passwordAttuale) {
            return { success: false, message: 'Password attuale non corretta' };
        }

        const { error: updateError } = await supabaseClient
            .from('clienti')
            .update({ password: btoa(nuovaPassword) })
            .eq('id', clienteId);

        if (updateError) {
            console.error("Errore cambio password:", updateError);
            return { success: false, message: updateError.message };
        }

        return { success: true, message: 'Password aggiornata con successo' };
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
    window.location.href = 'home.html';
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
