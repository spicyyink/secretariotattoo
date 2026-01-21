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

// --- SEGURIDAD Y REGISTRO ---
let CLAVES_DISPONIBLES = ['test.spicy.01', 'test-spicy-02', 'spicy.test.03', 'spicy-test-04', 'spicy.test-05', 'test-spicy.06'];
const usuariosAutorizados = new Map(); // Guarda ID y tiempo de inicio
let stats = { visitas: 0, fichas: 0 };

// --- ESCENA DE CRÍTICA (FEEDBACK) ---
const feedbackScene = new Scenes.WizardScene(
    'feedback-scene',
    (ctx) => {
        ctx.reply('🙏 ¡Datos guardados! ¿Quieres enviar tu valoración de tester ahora o prefieres seguir probando el resto del bot?',
            Markup.keyboard([['📝 Enviar valoración ahora'], ['🔍 Seguir testeando']]).oneTime().resize());
        return ctx.wizard.next();
    },
    (ctx) => {
        if (ctx.message.text.includes('Seguir testeando')) {
            ctx.reply('¡Perfecto! Sigue revisando los demás botones. Cuando quieras finalizar el test, vuelve a completar el formulario.');
            irAlMenuPrincipal(ctx);
            return ctx.scene.leave();
        }
        ctx.reply('1/3 ¿Has encontrado algún fallo o error técnico?');
        return ctx.wizard.next();
    },
    (ctx) => {
        ctx.wizard.state.errores = ctx.message.text;
        ctx.reply('2/3 ¿Qué cambiarías o añadirías para mejorar la experiencia?');
        return ctx.wizard.next();
    },
    (ctx) => {
        ctx.wizard.state.mejoras = ctx.message.text;
        ctx.reply('3/3 Valoración general del 1 al 10:', 
            Markup.keyboard([['1','2','3','4','5'],['6','7','8','9','10']]).oneTime().resize());
        return ctx.wizard.next();
    },
    async (ctx) => {
        const nota = ctx.message.text;
        const data = ctx.wizard.state;
        const inicio = usuariosAutorizados.get(ctx.from.id);
        const tiempoTotal = Math.round((Date.now() - inicio) / 1000 / 60); 

        const reporte = `📊 **FEEDBACK TESTER**\n\n👤 User: @${ctx.from.username || 'Sin alias'}\n⏱️ Tiempo: ${tiempoTotal} min\n❌ Errores: ${data.errores}\n💡 Mejoras: ${data.mejoras}\n⭐ Nota: ${nota}`;
        
        await ctx.telegram.sendMessage(MI_ID, reporte);
        await ctx.reply('✅ ¡Testeo enviado! He registrado tu tiempo y tus notas. Gracias por tu seriedad, nos vemos en el estudio para tu recompensa 🖋️.', Markup.removeKeyboard());
        return ctx.scene.leave();
    }
);

// --- ESCENA DE TATUAJE ---
const tattooScene = new Scenes.WizardScene(
    'tattoo-wizard',
    (ctx) => {
        ctx.reply('Iniciando formulario de testeo. Sé detallado.');
        ctx.wizard.state.formData = { user: ctx.from.username ? `@${ctx.from.username}` : 'Sin alias' };
        ctx.reply('¿Cómo te llamas?');
        return ctx.wizard.next();
    },
    (ctx) => { ctx.wizard.state.formData.nombre = ctx.message.text; ctx.reply('¿WhatsApp?'); return ctx.wizard.next(); },
    (ctx) => { ctx.wizard.state.formData.telefono = ctx.message.text; ctx.reply('¿Qué idea tienes?'); return ctx.wizard.next(); },
    async (ctx) => {
        ctx.wizard.state.formData.idea = ctx.message.text;
        stats.fichas++;
        return ctx.scene.enter('feedback-scene'); 
    }
);

// --- LÓGICA DE MENÚ Y ACCESO ---
function irAlMenuPrincipal(ctx) {
    return ctx.reply('🔥 MODO TESTER ACTIVO\nAnaliza todo con calma. Tu feedback serio tiene premio.', 
        Markup.keyboard([
            ['🔥 Hablar con SpicyBot'],
            ['💡 Consultar Ideas', '🧼 Cuidados'],
            ['🎁 Sorteos', '📅 Huecos Libres'],
            ['💬 Hablar con el Tatuador']
        ]).resize());
}

bot.start((ctx) => {
    if (usuariosAutorizados.has(ctx.from.id)) return irAlMenuPrincipal(ctx);
    ctx.reply('🔒 ACCESO RESTRINGIDO TESTERS.\nIntroduce tu clave de un solo uso para iniciar:');
});

bot.on('text', (ctx, next) => {
    const userId = ctx.from.id;
    const texto = ctx.message.text.toLowerCase();
    if (usuariosAutorizados.has(userId) || ctx.scene.current) return next();

    if (CLAVES_DISPONIBLES.includes(texto)) {
        CLAVES_DISPONIBLES = CLAVES_DISPONIBLES.filter(c => c !== texto);
        usuariosAutorizados.set(userId, Date.now()); 
        ctx.reply('✅ Clave aceptada. Tiempo en marcha. ¡A testear!');
        return irAlMenuPrincipal(ctx);
    }
    return ctx.reply('❌ Clave incorrecta.');
});

// --- BOTONES ---
bot.hears('🧼 Cuidados', (ctx) => ctx.reply('Guía: Lavar 3 veces, secar con papel y crema.'));
bot.hears('💬 Hablar con el Tatuador', (ctx) => ctx.reply('Contacto: @SpicyInkk'));
bot.hears('💡 Consultar Ideas', (ctx) => ctx.reply('Próximamente más ideas...'));
bot.hears('🎁 Sorteos', (ctx) => ctx.reply('Revisa el canal de sorteos.'));
bot.hears('📅 Huecos Libres', (ctx) => ctx.reply('Consulta Stories en Instagram.'));

const stage = new Scenes.Stage([tattooScene, feedbackScene]);
bot.use(session());
bot.use(stage.middleware());

bot.hears('🔥 Hablar con SpicyBot', (ctx) => ctx.scene.enter('tattoo-wizard'));

bot.launch().then(() => console.log('✅ SpicyBot Test & Feedback Operativo'));
