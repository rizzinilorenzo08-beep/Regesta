// Script per creare la tabella 'clienti' e inserire un record di test
const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = "https://nafessiwwdyjonisapxm.supabase.co";
const SUPABASE_KEY = "sb_publishable_MapN_q9Z-FsXpapSkHHWHQ_6b0MF8hD";

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

async function setupDatabase() {
    console.log('🔧 Inizio setup del database...\n');

    try {
        // 1. Crea la tabella clienti
        console.log('📝 Creazione tabella clienti...');
        const { error: createTableError } = await supabase.rpc('execute_sql', {
            sql: `
                CREATE TABLE IF NOT EXISTS clienti (
                    id BIGSERIAL PRIMARY KEY,
                    email TEXT UNIQUE NOT NULL,
                    password TEXT NOT NULL,
                    nome TEXT,
                    punti_spesa INTEGER DEFAULT 0,
                    data_registrazione TIMESTAMP DEFAULT NOW()
                );
            `
        }).catch(() => {
            // Fallback: usa il metodo alternativo
            return { error: 'Userò metodo alternativo' };
        });

        // Se il metodo rpc non funziona, mostriamo il SQL da eseguire manualmente
        if (createTableError) {
            console.log('⚠️  Metodo RPC non disponibile. Usa il SQL editor di Supabase per eseguire:');
            console.log('\n' + `
CREATE TABLE IF NOT EXISTS clienti (
    id BIGSERIAL PRIMARY KEY,
    email TEXT UNIQUE NOT NULL,
    password TEXT NOT NULL,
    nome TEXT,
    punti_spesa INTEGER DEFAULT 0,
    data_registrazione TIMESTAMP DEFAULT NOW()
);
            `.trim());
            console.log('\n');
        } else {
            console.log('✅ Tabella clienti creata');
        }

        // 2. Inserisci record di test
        console.log('➕ Inserimento record di test...\n');
        
        // Credenziali di test (password codificata in base64)
        const emailTest = "test@singoshop.it";
        const passwordTest = "Test123!"; // Password originale
        const passwordBase64 = Buffer.from(passwordTest).toString('base64'); // dGVzdFRlc3QxMjMh
        const nomeTest = "Cliente Test";

        const { data, error: insertError } = await supabase
            .from('clienti')
            .upsert([{
                email: emailTest,
                password: passwordBase64,
                nome: nomeTest,
                punti_spesa: 0
            }], { onConflict: 'email' })
            .select();

        if (insertError) {
            console.log('❌ Errore inserimento:', insertError.message);
        } else {
            console.log('✅ Record di test inserito\n');
        }

        // 3. Mostra le credenziali di test
        console.log('═'.repeat(60));
        console.log('🎯 CREDENZIALI DI TEST');
        console.log('═'.repeat(60));
        console.log(`📧 Email:    ${emailTest}`);
        console.log(`🔑 Password: ${passwordTest}`);
        console.log(`👤 Nome:     ${nomeTest}`);
        console.log(`⭐ Punti:    0 (guadagna facendo acquisti)`);
        console.log('═'.repeat(60) + '\n');

        console.log('✨ Usa queste credenziali per testare la registrazione/login!\n');

        // 4. Verifica che il record sia stato inserito
        console.log('🔍 Verifica record nel database...');
        const { data: verificaData, error: verificaError } = await supabase
            .from('clienti')
            .select('*')
            .eq('email', emailTest)
            .single();

        if (verificaError) {
            console.log('❌ Errore verifica:', verificaError.message);
        } else {
            console.log('✅ Record verificato nel database');
            console.log(`   ID: ${verificaData.id}`);
            console.log(`   Email: ${verificaData.email}`);
            console.log(`   Nome: ${verificaData.nome}`);
        }

    } catch (error) {
        console.error('❌ Errore generico:', error.message);
    }

    console.log('\n🎉 Setup completato!\n');
}

setupDatabase();
