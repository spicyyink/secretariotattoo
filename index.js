require('dotenv').config();

const { Telegraf, Scenes, session, Markup } = require('telegraf');
const http = require('http');

// ==========================================
// SERVIDOR DE SALUD (Mantiene el bot 24/7)
// ==========================================
const server = http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('SpicyBot está online ✅');
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Servidor escuchando en puerto ${PORT}`));

// ==========================================
// CONFIGURACIÓN DEL BOT
// ==========================================
const bot = new Telegraf(process.env.BOT_TOKEN);
const MI_ID = process.env.MI_ID;

// --- ESCENA DE IDEAS ---
const ideasScene = new Scenes.WizardScene(
    'ideas-scene',
    (ctx) => {
        ctx.reply('💡 **Modo Ideas**\n¿En qué zona estás pensando?',
            Markup.keyboard([['Rodilla', 'Codo', 'Cuello'], ['Tríceps', 'Bíceps', 'Antebrazo'], ['⬅️ Volver']]).oneTime().resize());
        return ctx.wizard.next();
    },
    (ctx) => {
        const zona = ctx.message.text ? ctx.message.text.toLowerCase() : '';
        if (zona.includes('volver')) return irAlMenuPrincipal(ctx);
        ctx.reply('🌟 Consejo: Para esa zona busca algo que fluya con tu anatomía.');
        setTimeout(() => irAlMenuPrincipal(ctx), 1500);
        return ctx.scene.leave();
    }
);

// --- ESCENA DE PRESUPUESTO (CON TODAS TUS PETICIONES) ---
const tattooScene = new Scenes.WizardScene(
    'tattoo-wizard',
    (ctx) => {
        ctx.reply('¡Hola! 👋 Soy **SpicyBot**.\n\n¿Tu **nombre**?', { parse_mode: 'Markdown' });
        ctx.wizard.state.formData = { user: ctx.from.username ? `@${ctx.from.username}` : 'Sin alias' };
        return ctx.wizard.next();
    },
    (ctx) => {
        ctx.wizard.state.formData.nombre = ctx.message.text;
        ctx.reply('🔞 ¿Eres mayor de 18 años?', Markup.keyboard([['Sí, soy mayor', 'No']]).oneTime().resize());
        return ctx.wizard.next();
    },
    (ctx) => {
        if (ctx.message.text === 'No') {
            ctx.reply('⚠️ Lo siento, debes ser mayor de edad.');
            return ctx.scene.leave();
        }
        ctx.reply('🏥 ¿Sufres de alergias o tomas medicación?', 
            Markup.keyboard([['No, todo bien'], ['Sí (especificar)', 'No lo sé']]).oneTime().resize());
        return ctx.wizard.next();
    },
    (ctx) => {
        ctx.wizard.state.formData.salud = ctx.message.text;
        ctx.reply('¿Tu **teléfono**?', Markup.removeKeyboard());
        return ctx.wizard.next();
    },
    (ctx) => {
        ctx.wizard.state.formData.telefono = ctx.message.text;
        ctx.reply('¿Qué **diseño** tienes en mente?');
        return ctx.wizard.next();
    },
    (ctx) => {
        ctx.wizard.state.formData.idea = ctx.message.text;
        ctx.reply('📏 ¿Tamaño aproximado en cm?', 
            Markup.keyboard([['No lo sé, que el artista me asesore']]).oneTime().resize());
        return ctx.wizard.next();
    },
    (ctx) => {
        ctx.wizard.state.formData.tamano = ctx.message.text;
        ctx.reply('🩹 ¿Tienes cicatrices o lunares en la zona?', 
            Markup.keyboard([['Piel limpia', 'Tengo cicatrices/lunares']]).oneTime().resize());
        return ctx.wizard.next();
    },
    (ctx) => {
        ctx.wizard.state.formData.piel = ctx.message.text;
        ctx.reply('🕒 ¿Qué horario prefieres?', 
            Markup.keyboard([['Mañanas', 'Tardes'], ['Cualquier horario']]).oneTime().resize());
        return ctx.wizard.next();
    },
    (ctx) => {
        ctx.wizard.state.formData.horario = ctx.message.text;
        ctx.reply('Envíame una foto de referencia:', Markup.keyboard([['❌ No tengo foto']]).oneTime().resize());
        return ctx.wizard.next();
    },
    async (ctx) => {
        const d = ctx.wizard.state.formData;
        let photoId = ctx.message.photo ? ctx.message.photo[ctx.message.photo.length - 1].file_id : null;
        await ctx.reply('¡Ficha enviada! El artista te contactará pronto. 🔥', Markup.removeKeyboard());

        const ficha = `🖋️ **NUEVA SOLICITUD**\n👤: ${d.nombre}\n🏥 Salud: ${d.salud}\n📞: ${d.telefono}\n💡 Idea: ${d.idea}\n📏 Tamaño: ${d.tamano}\n🩹 Piel: ${d.piel}\n🕒 Horario: ${d.horario}`;
        await ctx.telegram.sendMessage(MI_ID, ficha, {
            parse_mode: 'Markdown',
            ...Markup.inlineKeyboard([[Markup.button.url('💬 Abrir WhatsApp', `https://wa.me/${d.telefono.replace(/\D/g, '')}`)]])
        });
        if (photoId) await ctx.telegram.sendPhoto(MI_ID, photoId);
        setTimeout(() => irAlMenuPrincipal(ctx), 2000);
        return ctx.scene.leave();
    }
);

// --- MENÚ Y LÓGICA ---
function irAlMenuPrincipal(ctx) {
    return ctx.reply('Bienvenido a Spicy Inkk 🖋️', 
        Markup.keyboard([['🔥 Hablar con SpicyBot'], ['💡 Consultar Ideas', '🧼 Cuidados']]).oneTime().resize());
}

bot.hears('🧼 Cuidados', (ctx) => {
    ctx.reply('✨ **Cuidados:**\n1. Lava con jabón neutro.\n2. Hidrata con crema.\n3. Evita sol y piscinas 15 días.');
});

const stage = new Scenes.Stage([tattooScene, ideasScene]);
bot.use(session());
bot.use(stage.middleware());
bot.start((ctx) => irAlMenuPrincipal(ctx));
bot.hears('🔥 Hablar con SpicyBot', (ctx) => ctx.scene.enter('tattoo-wizard'));
bot.hears('💡 Consultar Ideas', (ctx) => ctx.scene.enter('ideas-scene'));

bot.launch().then(() => console.log('✅ SpicyBot Online'));
bot.catch((err) => console.error(err));
