// seed_products.js
// Utility per generare prodotti di test e garantire almeno N prodotti per categoria.
// Uso: apri la console del browser su una pagina che carica `db.js` (quindi ha `supabaseClient`),
// poi esegui `await seedProducts.ensureMinProductsPerCategory(20)`.

(function(window){
    async function getDistinctCategories() {
        try {
            // Prova a leggere tutte le categorie presenti
            const { data, error } = await supabaseClient
                .from('inventario')
                .select('categoria')
                .neq('categoria', null);
            if (error || !data) return [];
            const cats = Array.from(new Set(data.map(r => r.categoria).filter(Boolean)));
            return cats;
        } catch (e) {
            console.error('Errore getDistinctCategories:', e.message || e);
            return [];
        }
    }

    function defaultCategories() {
        return [
            'Frutta', 'Verdura', 'Latticini', 'Bevande', 'Pane', 'Dolci', 'Conservati', 'Carne', 'Pesce'
        ];
    }

    function genEmojiForCategory(cat) {
        const map = {
            'Frutta':'🍎','Verdura':'🥦','Latticini':'🧀','Bevande':'🥤','Pane':'🥖','Dolci':'🍰',
            'Conservati':'🥫','Carne':'🍗','Pesce':'🐟'
        };
        return map[cat] || '📦';
    }

    function randomPrice() {
        return Number((Math.random() * 8 + 0.5).toFixed(2));
    }

    async function countCategory(cat) {
        // head:true con select restituisce il count
        const { error, count } = await supabaseClient
            .from('inventario')
            .select('id', { count: 'exact', head: true })
            .eq('categoria', cat);
        if (error) {
            console.error('Errore countCategory', cat, error.message || error);
            return 0;
        }
        return count || 0;
    }

    async function insertProducts(products) {
        if (!products || products.length === 0) return { inserted: 0 };
        const { data, error } = await supabaseClient
            .from('inventario')
            .insert(products)
            .select();
        if (error) {
            console.error('Errore inserimento prodotti:', error.message || error);
            return { inserted: 0, error };
        }
        return { inserted: data.length, data };
    }

    async function ensureMinProductsPerCategory(minCount = 20) {
        if (typeof supabaseClient === 'undefined') {
            throw new Error('supabaseClient non trovato. Carica prima db.js nella pagina.');
        }

        let categories = await getDistinctCategories();
        if (!categories || categories.length === 0) categories = defaultCategories();

        const results = {};

        for (const cat of categories) {
            const existing = await countCategory(cat);
            const missing = Math.max(0, minCount - existing);
            results[cat] = { existing, missing };
            if (missing > 0) {
                const toInsert = [];
                for (let i = 0; i < missing; i++) {
                    const idx = existing + i + 1;
                    toInsert.push({
                        nome: `${cat} - Prodotto ${idx}`,
                        prezzo: randomPrice(),
                        qty: 100,
                        max_qty: 100,
                        categoria: cat,
                        icona: genEmojiForCategory(cat)
                    });
                }
                const r = await insertProducts(toInsert);
                results[cat].inserted = r.inserted || 0;
            }
        }

        console.table(results);
        return results;
    }

    // Genera uno script SQL con INSERT per i prodotti mancanti (utile per incollare nella SQL Console di Supabase)
    async function generateSqlForMissing(minCount = 20) {
        let categories = await getDistinctCategories();
        if (!categories || categories.length === 0) categories = defaultCategories();

        const parts = [];
        for (const cat of categories) {
            const existing = await countCategory(cat);
            const missing = Math.max(0, minCount - existing);
            if (missing > 0) {
                for (let i = 0; i < missing; i++) {
                    const idx = existing + i + 1;
                    // escape single quotes
                    const nome = (cat + ' - Prodotto ' + idx).replace(/'/g, "''");
                    const prezzo = (Math.random() * 8 + 0.5).toFixed(2);
                    const icona = genEmojiForCategory(cat).replace(/'/g, "''");
                    parts.push(`INSERT INTO inventario (nome, prezzo, qty, max_qty, categoria, icona) VALUES ('${nome}', ${prezzo}, 100, 100, '${cat.replace(/'/g, "''")}', '${icona}');`);
                }
            }
        }
        return parts.join('\n');
    }

    // Copia il testo SQL negli appunti (se supportato dal browser)
    function copySqlToClipboard(sql) {
        if (!sql) return Promise.reject(new Error('Nessun SQL da copiare'));
        if (navigator.clipboard && navigator.clipboard.writeText) {
            return navigator.clipboard.writeText(sql);
        }
        // Fallback: crea textarea temporanea
        return new Promise((resolve, reject) => {
            try {
                const ta = document.createElement('textarea');
                ta.value = sql;
                document.body.appendChild(ta);
                ta.select();
                document.execCommand('copy');
                document.body.removeChild(ta);
                resolve();
            } catch (e) {
                reject(e);
            }
        });
    }

    // Espone l'API sul window per uso rapido nella console
    window.seedProducts = {
        ensureMinProductsPerCategory,
        generateSqlForMissing,
        copySqlToClipboard
    };

    // CommonJS/ESM export (se usato in ambienti bundler)
    if (typeof module !== 'undefined' && module.exports) module.exports = { ensureMinProductsPerCategory };

})(window);

/*
Esempio d'uso (console del browser):
    await seedProducts.ensureMinProductsPerCategory(20);

Lo script tenterà di leggere le categorie attuali dalla tabella `inventario`.
Se non trova categorie, userà una lista di default e riempirà ciascuna fino a raggiungere
il numero richiesto di prodotti per categoria.
*/
