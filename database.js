const DEFAULT_BUDGET = 5000;

const INIZIALI_INVENTARIO = [
    { id: 1, nome: "Latte Intero", cat: "Alimentari", sub: "Da frigo", qty: 45, maxQty: 100, prezzo: 1.20, icona: "🥛" },
    { id: 2, nome: "Piselli Surgelati", cat: "Alimentari", sub: "Da freezer", qty: 20, maxQty: 60, prezzo: 2.50, icona: "🫛" },
    { id: 3, nome: "Biscotti Frollini", cat: "Alimentari", sub: "Biscotti", qty: 60, maxQty: 80, prezzo: 1.80, icona: "🍪" },
    { id: 4, nome: "Acqua Naturale 1.5L", cat: "Alimentari", sub: "Bevande", qty: 120, maxQty: 200, prezzo: 0.50, icona: "💧" },
    { id: 5, nome: "Detersivo Piatti", cat: "Cura della casa", sub: "Cucina", qty: 30, maxQty: 50, prezzo: 1.90, icona: "🧼" },
    { id: 6, nome: "Scopa", cat: "Cura della casa", sub: "Casa", qty: 5, maxQty: 30, prezzo: 5.00, icona: "🧹" },
    { id: 7, nome: "Ammorbidente", cat: "Cura della casa", sub: "Bucato", qty: 25, maxQty: 50, prezzo: 3.20, icona: "🧴" },
    { id: 8, nome: "Pianta di Ficus", cat: "Giardinaggio", sub: "Piante", qty: 10, maxQty: 20, prezzo: 15.00, icona: "🪴" },
    { id: 9, nome: "Semi di Pomodoro", cat: "Giardinaggio", sub: "Semi", qty: 50, maxQty: 100, prezzo: 1.00, icona: "🍅" },
    { id: 10, nome: "Tubo Irrigazione", cat: "Giardinaggio", sub: "Irrigazione", qty: 8, maxQty: 50, prezzo: 25.00, icona: "🚰" },
    { id: 11, nome: "Rastrello", cat: "Giardinaggio", sub: "Cura del giardino", qty: 12, maxQty: 25, prezzo: 12.00, icona: "🍂" },
    { id: 12, nome: "Liquido Tergicristalli", cat: "Macchina", sub: "Pulizia", qty: 15, maxQty: 100, prezzo: 4.50, icona: "🧪" },
    { id: 13, nome: "Olio Motore 5W-30", cat: "Macchina", sub: "Manutenzione", qty: 18, maxQty: 40, prezzo: 9.90, icona: "🛢️" }
];

const STORAGE_KEYS = {
    inventario: 'inventario',
    vendite: 'vendite',
    budget: 'budgetAziendale',
    managerCart: 'managerCart',
    carrelloCheckout: 'carrelloCheckout',
    totaleCheckout: 'totaleCheckout',
    ultimoTotale: 'ultimoTotale'
};

function ensureDatabase() {
    if (!localStorage.getItem(STORAGE_KEYS.inventario)) {
        localStorage.setItem(STORAGE_KEYS.inventario, JSON.stringify(INIZIALI_INVENTARIO));
    }
    if (!localStorage.getItem(STORAGE_KEYS.vendite)) {
        localStorage.setItem(STORAGE_KEYS.vendite, JSON.stringify([]));
    }
    if (!localStorage.getItem(STORAGE_KEYS.budget)) {
        localStorage.setItem(STORAGE_KEYS.budget, DEFAULT_BUDGET);
    }
}

function loadInventario() {
    ensureDatabase();
    return JSON.parse(localStorage.getItem(STORAGE_KEYS.inventario));
}

function saveInventario(inventario) {
    localStorage.setItem(STORAGE_KEYS.inventario, JSON.stringify(inventario));
}

function loadVendite() {
    ensureDatabase();
    return JSON.parse(localStorage.getItem(STORAGE_KEYS.vendite));
}

function saveVendite(vendite) {
    localStorage.setItem(STORAGE_KEYS.vendite, JSON.stringify(vendite));
}

function loadBudget() {
    ensureDatabase();
    return parseFloat(localStorage.getItem(STORAGE_KEYS.budget)) || DEFAULT_BUDGET;
}

function saveBudget(budget) {
    localStorage.setItem(STORAGE_KEYS.budget, budget);
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

function formatCurrency(value) {
    return `€ ${Number(value).toFixed(2)}`;
}
