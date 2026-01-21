require('dotenv').config();
const { Telegraf, Scenes, session, Markup } = require('telegraf');
const http = require('http');

const server = http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('SpicyBot Test Privado ✅');
});
server.listen(process.env.PORT || 3000);

const bot = new Telegraf(process.env.BOT_TOKEN);
const MI_ID = process.env.MI_ID;

// --- SEGURIDAD Y CRONÓMETRO ---
let CLAVES_DISPONIBLES = ['s7p', 'k82', 'x9w', 'n4m', 'v2t', 'b5z'];
const usuariosAutorizados = new Map(); // Guarda el ID y el timestamp de inicio

// --- ESCENA DE FEEDBACK (CON CÁLCULO DE TIEMPO) ---
const feedbackScene = new Scenes.WizardScene(
    'feedback-scene',
    (ctx) => {
        ctx.reply('🙏 ¡Datos guardados! ¿Quieres enviar tu valoración ahora o prefieres seguir testeando?',
            Markup.keyboard([['📝 Enviar valoración ahora'], ['🔍 Seguir testeando']]).oneTime().resize());
        return ctx.wizard.next();
    },
    (ctx) => {
        if (ctx.message.text && ctx.message.text.includes('Seguir testeando')) {
            ctx.reply('¡Perfecto! Sigue revisando el bot. El cronómetro sigue contando...');
            irAlMenuPrincipal(ctx);
            return ctx.scene.leave();
        }
        ctx.reply('1/3 ¿Has encontrado algún fallo o error técnico?');
        return ctx.wizard.next();
    },
    (ctx) => {
        ctx.wizard.state.errores = ctx.message.text;
        ctx.reply('2/3 ¿Qué cambiarías o añadirías para mejorar el bot?');
        return ctx.wizard.next();
    },
    (ctx) => {
        ctx.wizard.state.mejoras = ctx.message.text;
        ctx.reply('3/3 Valoración del 1 al 10:', 
            Markup.keyboard([['1','2','3','4','5'],['6','7','8','9','10']]).oneTime().resize());
        return ctx.wizard.next();
    },
    async (ctx) => {
        const nota = ctx.message.text;
        const data = ctx.wizard.state;
        
        // --- CÁLCULO DE TIEMPO ---
        const inicio = usuariosAutorizados.get(ctx.from.id);
        let tiempoTotal = "N/A";
        if (inicio) {
            const diferenciaMs = Date.now() - inicio;
            tiempoTotal = Math.round(diferenciaMs / 1000 / 60); // Convertir a minutos
        }

        const reporte = `📊 **FEEDBACK DE TESTER**\n\n👤 User: @${ctx.from.username || 'Sin alias'}\n⏱️ Tiempo total de testeo: ${tiempoTotal} min\n❌ Errores: ${data.errores}\n💡 Mejoras: ${data.mejoras}\n⭐ Nota: ${nota}`;
        
        await ctx.telegram.sendMessage(MI_ID, reporte);
        await ctx.reply(`✅ ¡Análisis enviado! Has dedicado ${tiempoTotal} minutos al testeo. Gracias por tu seriedad.`, Markup.removeKeyboard());
        return ctx.scene.leave();
    }
);

// --- ESCENA DE TATUAJE ---
const tattooScene = new Scenes.WizardScene(
    'tattoo-wizard',
    (ctx) => {
        ctx.reply('Iniciando formulario de prueba...');
        ctx.wizard.state.formData = { user: ctx.from.username ? `@${ctx.from.username}` : 'Sin alias' };
        ctx.reply('¿Cómo te llamas?');
        return ctx.wizard.next();
    },
    (ctx) => { ctx.wizard.state.formData.nombre = ctx.message.text; ctx.reply('¿WhatsApp?'); return ctx.wizard.next(); },
    (ctx) => { ctx.wizard.state.formData.telefono = ctx.message.text; ctx.reply('¿Qué idea tienes?'); return ctx.wizard.next(); },
    async (ctx) => {
        ctx.wizard.state.formData.idea = ctx.message.text;
        return ctx.scene.enter('feedback-scene'); 
    }
);

// --- MENÚ ---
function irAlMenuPrincipal(ctx) {
    return ctx.reply('🔥 MODO TESTER ACTIVO\nAnaliza todo con calma. El tiempo se está registrando.', 
        Markup.keyboard([
            ['🔥 Hablar con SpicyBot'],
            ['💡 Consultar Ideas', '🧼 Cuidados'],
            ['🎁 Sorteos', '📅 Huecos Libres'],
            ['💬 Hablar con el Tatuador']
        ]).resize());
}

// --- PORTERO CON EXCEPCIÓN PARA TI ---
bot.start((ctx) => {
    if (ctx.from.id.toString() === MI_ID || usuariosAutorizados.has(ctx.from.id)) {
        return irAlMenuPrincipal(ctx);
    }
    ctx.reply('🔒 ACCESO RESTRINGIDO TESTERS.\nIntroduce tu clave corta para iniciar el análisis:');
});

bot.on('text', (ctx, next) => {
    const userId = ctx.from.id;
    const texto = ctx.message.text.toLowerCase().trim();

    if (userId.toString() === MI_ID || usuariosAutorizados.has(userId) || ctx.scene.current) {
        return next();
    }

    if (CLAVES_DISPONIBLES.includes(texto)) {
        CLAVES_DISPONIBLES = CLAVES_DISPONIBLES.filter(c => c !== texto);
        usuariosAutorizados.set(userId, Date.now()); // AQUÍ EMPIEZA EL TIEMPO
        ctx.reply('✅ Clave aceptada. El cronómetro ha empezado.');
        return irAlMenuPrincipal(ctx);
    }
    return ctx.reply('❌ Clave incorrecta.');
});

// --- COMANDO DE ESTADÍSTICAS ---
bot.command('tester_stats', (ctx) => {
    if (ctx.from.id.toString() === MI_ID) {
        ctx.reply(`📊 ESTADO:\nTesters: ${usuariosAutorizados.size}\nClaves: ${CLAVES_DISPONIBLES.join(', ')}`);
    }
});

const stage = new Scenes.Stage([tattooScene, feedbackScene]);
bot.use(session());
bot.use(stage.middleware());

bot.hears('🔥 Hablar con SpicyBot', (ctx) => ctx.scene.enter('tattoo-wizard'));
bot.hears('🧼 Cuidados', (ctx) => ctx.reply('Lavar 3 veces, secar con papel y Aquaphor.'));
bot.hears('💬 Hablar con el Tatuador', (ctx) => ctx.reply('Contacto: @SpicyInkk'));

bot.launch().then(() => console.log('✅ SpicyBot Cronometrado Operativo'));
