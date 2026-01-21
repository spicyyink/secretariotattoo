require('dotenv').config();
const { Telegraf, Scenes, session, Markup } = require('telegraf');
const http = require('http');

const server = http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('SpicyBot Pro Engine ✅');
});
server.listen(process.env.PORT || 3000);

const bot = new Telegraf(process.env.BOT_TOKEN);
const MI_ID = process.env.MI_ID;

let CLAVES_DISPONIBLES = ['s7p', 'k82', 'x9w', 'n4m', 'v2t', 'b5z'];
const usuariosAutorizados = new Map(); 
let stats = { visitas: 0, fichas: 0 };

// ==========================================
// ESCENA: VALORACIÓN TESTER
// ==========================================
const feedbackScene = new Scenes.WizardScene(
    'feedback-scene',
    (ctx) => {
        ctx.reply('📊 INICIO DE VALORACIÓN\n\n1. ¿Has detectado algún fallo técnico o error en los textos?');
        return ctx.wizard.next();
    },
    (ctx) => {
        ctx.wizard.state.fallos = ctx.message.text;
        ctx.reply('2. ¿Qué te ha parecido la fluidez del bot y la facilidad de uso?');
        return ctx.wizard.next();
    },
    (ctx) => {
        ctx.wizard.state.opinion = ctx.message.text;
        ctx.reply('3. ¿Qué añadirías o cambiarías para hacerlo más profesional?');
        return ctx.wizard.next();
    },
    (ctx) => {
        ctx.wizard.state.mejoras = ctx.message.text;
        ctx.reply('4. Finalmente, valora la experiencia del 1 al 10:', 
            Markup.keyboard([['1','2','3','4','5'],['6','7','8','9','10']]).oneTime().resize());
        return ctx.wizard.next();
    },
    async (ctx) => {
        const nota = ctx.message.text;
        const d = ctx.wizard.state;
        const inicio = usuariosAutorizados.get(ctx.from.id);
        const tiempo = inicio ? Math.round((Date.now() - inicio) / 1000 / 60) : 0; 

        const reporte = `🌟 FEEDBACK TESTER\n\nUser: @${ctx.from.username}\nTiempo: ${tiempo} min\n\nFallos: ${d.fallos}\nOpinión: ${d.opinion}\nMejoras: ${d.mejoras}\nNota: ${nota}/10`;
        await ctx.telegram.sendMessage(MI_ID, reporte);
        await ctx.reply('✅ Valoración enviada. ¡Gracias por ayudarnos a mejorar!');
        return irAlMenuPrincipal(ctx);
    }
);

// ==========================================
// ESCENA: CONSULTORÍA SPICYBOT (10 PREGUNTAS)
// ==========================================
const tattooScene = new Scenes.WizardScene(
    'tattoo-wizard',
    (ctx) => {
        ctx.reply('👋 Bienvenido a la consultoría técnica.\n\n1. ¿Cuál es tu nombre completo?');
        ctx.wizard.state.form = { user: ctx.from.username || 'n/a' };
        return ctx.wizard.next();
    },
    (ctx) => {
        ctx.wizard.state.form.nombre = ctx.message.text;
        ctx.reply('2. ¿Qué edad tienes?', Markup.keyboard([['+18 años', 'Entre 16 y 18'], ['Menos de 16']]).oneTime().resize());
        return ctx.wizard.next();
    },
    (ctx) => {
        const edadText = ctx.message.text;
        if (edadText === 'Menos de 16') {
            ctx.reply('Lo sentimos, el estudio no realiza tatuajes a menores de 16 años.');
            return ctx.scene.leave();
        }
        ctx.wizard.state.form.edad = edadText;
        ctx.reply('3. ¿Qué estilo buscas?', Markup.keyboard([['Realismo', 'Fine Line', 'Blackwork'], ['Tradicional', 'Microrealismo', 'Otro']]).oneTime().resize());
        return ctx.wizard.next();
    },
    (ctx) => {
        ctx.wizard.state.form.estilo = ctx.message.text;
        ctx.reply('4. ¿En qué zona del cuerpo quieres el tatuaje?');
        return ctx.wizard.next();
    },
    (ctx) => {
        ctx.wizard.state.form.zona = ctx.message.text;
        ctx.reply('5. ¿Tienes cicatrices, quemaduras o lunares en esa zona?', Markup.keyboard([['Piel limpia', 'Tengo marcas/lunares']]).oneTime().resize());
        return ctx.wizard.next();
    },
    (ctx) => {
        ctx.wizard.state.form.piel = ctx.message.text;
        ctx.reply('6. ¿Qué tamaño aproximado quieres (en cm)?');
        return ctx.wizard.next();
    },
    (ctx) => {
        ctx.wizard.state.form.tamano = ctx.message.text;
        ctx.reply('7. ¿Es tu primer tatuaje?', Markup.keyboard([['Sí, es el primero', 'No, ya llevo otros']]).oneTime().resize());
        return ctx.wizard.next();
    },
    (ctx) => {
        ctx.wizard.state.form.primero = ctx.message.text;
        ctx.reply('8. ¿Sufres de alergias, diabetes o tomas medicación?', Markup.keyboard([['Todo bien', 'Sí (especificar)']]).oneTime().resize());
        return ctx.wizard.next();
    },
    (ctx) => {
        ctx.wizard.state.form.salud = ctx.message.text;
        ctx.reply('9. Indica tu número de WhatsApp para enviarte el presupuesto:');
        return ctx.wizard.next();
    },
    (ctx) => {
        ctx.wizard.state.form.whatsapp = ctx.message.text;
        ctx.reply('10. Por último, envíame una foto de referencia o de la zona a tatuar:', Markup.keyboard([['Sin foto']]).oneTime().resize());
        return ctx.wizard.next();
    },
    async (ctx) => {
        let photoId = ctx.message.photo ? ctx.message.photo[ctx.message.photo.length - 1].file_id : null;
        stats.fichas++;
        const f = ctx.wizard.state.form;

        const ficha = `🖋️ NUEVA CONSULTA\n\nNombre: ${f.nombre}\nEdad: ${f.edad}\nEstilo: ${f.estilo}\nZona: ${f.zona}\nMedidas: ${f.tamano}\nPiel: ${f.piel}\nPrimer tattoo: ${f.primero}\nSalud: ${f.salud}\nWA: ${f.whatsapp}`;
        
        await ctx.telegram.sendMessage(MI_ID, ficha);
        if (photoId) await ctx.telegram.sendPhoto(MI_ID, photoId);

        await ctx.reply('🚀 Ficha técnica enviada al tatuador. ¡Gracias por la información!');
        return irAlMenuPrincipal(ctx);
    }
);

// ==========================================
// NAVEGACIÓN Y MENÚ
// ==========================================

function irAlMenuPrincipal(ctx) {
    stats.visitas++;
    return ctx.reply('💎 SPICY INKK - MENÚ PRINCIPAL\n\nSelecciona una opción para testear el bot:', 
        Markup.keyboard([
            ['🔥 Hablar con SpicyBot'],
            ['💡 Consultar Ideas', '🧼 Cuidados'],
            ['🎁 Sorteos', '📅 Huecos Libres'],
            ['💬 Tatuador', '⭐ Valoración Tester']
        ]).resize());
}

bot.start((ctx) => {
    if (ctx.from.id.toString() === MI_ID || usuariosAutorizados.has(ctx.from.id)) {
        if (!usuariosAutorizados.has(ctx.from.id)) usuariosAutorizados.set(ctx.from.id, Date.now());
        return irAlMenuPrincipal(ctx);
    }
    ctx.reply('🔒 ACCESO RESTRINGIDO\nIntroduce tu clave de tester:');
});

bot.on('text', (ctx, next) => {
    const userId = ctx.from.id;
    const texto = ctx.message.text.toLowerCase().trim();
    if (userId.toString() === MI_ID || usuariosAutorizados.has(userId) || ctx.scene.current) return next();
    if (CLAVES_DISPONIBLES.includes(texto)) {
        CLAVES_DISPONIBLES = CLAVES_DISPONIBLES.filter(c => c !== texto);
        usuariosAutorizados.set(userId, Date.now()); 
        return irAlMenuPrincipal(ctx);
    }
    return ctx.reply('❌ Clave inválida.');
});

const stage = new Scenes.Stage([tattooScene, feedbackScene]);
bot.use(session());
bot.use(stage.middleware());

bot.hears('🔥 Hablar con SpicyBot', (ctx) => ctx.scene.enter('tattoo-wizard'));
bot.hears('⭐ Valoración Tester', (ctx) => ctx.scene.enter('feedback-scene'));

bot.hears('🧼 Cuidados', (ctx) => {
    ctx.reply('✨ GUÍA DE CUIDADOS PROFESIONAL\n\n1. Lavado: Lava el tatuaje 3 veces al día con agua tibia y jabón neutro (sin perfumes).\n\n2. Secado: Seca a toques suaves con papel de cocina desechable. Nunca uses toallas de tela.\n\n3. Hidratación: Aplica una capa muy fina de crema cicatrizante. El tatuaje debe brillar un poco, pero no quedar cubierto por un "pegote" de crema.\n\n4. Cremas recomendadas: Aquaphor (Eucerin) o Bepanthol Tatuajes.\n\n5. Prohibiciones: Durante 15 días nada de sol directo, piscinas, playa o saunas. No rasques ni arranques las pieles/costras.');
});

bot.hears('🎁 Sorteos', (ctx) => {
    ctx.reply('🔥 SORTEO ACTIVO: 05-10 FEB 2026', Markup.inlineKeyboard([[Markup.button.url('🔗 Participar', 'https://t.me/+bAbJXSaI4rE0YzM0')]]));
});

bot.hears('💬 Tatuador', (ctx) => ctx.reply('Contacto directo: @SpicyInkk'));
bot.hears('📅 Huecos Libres', (ctx) => ctx.reply('Revisa las Stories de Instagram para ver las cancelaciones y huecos de esta semana.'));
bot.hears('💡 Consultar Ideas', (ctx) => ctx.reply('¿Qué zona del cuerpo tienes en mente? Cuéntame tu idea y te daré consejos sobre qué fluye mejor.'));

bot.launch().then(() => console.log('✅ SpicyBot Pro Operativo'));
