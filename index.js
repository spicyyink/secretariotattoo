require('dotenv').config(); // 1. CARGA TUS SECRETOS (.env)

const { Telegraf, Scenes, session, Markup } = require('telegraf');
const http = require('http');

// ==========================================
// 2. SERVIDOR PARA MANTENER VIVO (Optimizado para Render)
// ==========================================
const server = http.createServer((req, res) => {
    console.log(`Petición recibida de: ${req.url} - Manteniendo bot despierto ⚡`);
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('SpicyBot está online ✅');
});

// Render asigna un puerto automáticamente en process.env.PORT
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Servidor de salud escuchando en el puerto ${PORT}`);
});

// ==========================================
// 3. CONFIGURACIÓN SEGURA
// ==========================================
const BOT_TOKEN = process.env.BOT_TOKEN; 
const MI_ID = process.env.MI_ID;

const bot = new Telegraf(BOT_TOKEN);

// --- ESCENA 1: CONSULTA DE IDEAS ---
const ideasScene = new Scenes.WizardScene(
    'ideas-scene',
    (ctx) => {
        ctx.reply(
            '💡 **Modo Consultas Personalizadas**\n\n¿En qué zona estás pensando? (Recuerda que solo doy ideas, el precio lo gestiona el artista):',
            Markup.keyboard([
                ['Rodilla', 'Codo', 'Cuello'],
                ['Tríceps', 'Bíceps', 'Antebrazo'],
                ['Tobillo', 'Gemelo', 'Espalda'],
                ['⬅️ Volver al Menú']
            ]).oneTime().resize()
        );
        return ctx.wizard.next();
    },
    (ctx) => {
        const zona = ctx.message.text ? ctx.message.text.toLowerCase() : '';
        if (zona.includes('volver') || zona.includes('menú')) return irAlMenuPrincipal(ctx);

        if (zona.includes('rodilla') || zona.includes('codo')) {
            ctx.reply('🌟 Diseños circulares: Mandalas, rosas tradicionales o telarañas.');
        } else if (zona.includes('cuello')) {
            ctx.reply('🌟 Laterales: Dagas o mariposas. Nuca: Polillas o simetría.');
        } else if (zona.includes('triceps') || zona.includes('tríceps')) {
            ctx.reply('🌟 Verticales: Blackwork sólido o calaveras alargadas.');
        } else if (zona.includes('biceps') || zona.includes('bíceps')) {
            ctx.reply('🌟 Realismo: Retratos o flores que sigan la curva del músculo.');
        } else if (zona.includes('antebrazo')) {
            ctx.reply('🌟 Composiciones: Bosques, brújulas o serpientes que envuelvan.');
        } else if (zona.includes('tobillo')) {
            ctx.reply('🌟 Fine Line: Enredaderas o brazaletes minimalistas.');
        } else if (zona.includes('gemelo')) {
            ctx.reply('🌟 Impacto: Realismo, guerreros o Neo-tradicional con color.');
        } else if (zona.includes('espalda') || zona.includes('pecho')) {
            ctx.reply('🌟 Piezas grandes: Águilas extendidas o arte japonés.');
        } else {
            ctx.reply('🤔 No tengo guía para esa zona, pero te recomiendo algo que fluya con tu anatomía.');
        }

        ctx.reply('⚠️ *Nota: El bot no proporciona presupuestos.* ¿Qué quieres hacer ahora?', {
            parse_mode: 'Markdown',
            ...Markup.keyboard([['🔥 Hablar con SpicyBot', '💡 Consultar otra zona']]).oneTime().resize()
        });
        return ctx.wizard.next();
    },
    (ctx) => {
        if (ctx.message.text === '🔥 Hablar con SpicyBot') return ctx.scene.enter('tattoo-wizard');
        return ctx.scene.enter('ideas-scene');
    }
);

// --- ESCENA 2: HABLAR CON SPICYBOT (PRESUPUESTO) ---
const tattooScene = new Scenes.WizardScene(
    'tattoo-wizard',
    (ctx) => {
        ctx.reply(
            `¡Hola! 👋 Soy **SpicyBot**, el asistente de [SpicyInkk](https://t.me/SpicyInkk).\n\n` +
            `⚠️ *Aviso:* Recogeré tus datos para que el artista pueda darte un precio.\n\n` +
            `¿Tu **nombre**?`,
            { parse_mode: 'Markdown' }
        );
        ctx.wizard.state.formData = { user: ctx.from.username ? `@${ctx.from.username}` : 'Sin alias' };
        return ctx.wizard.next();
    },
    (ctx) => {
        ctx.wizard.state.formData.nombre = ctx.message.text;
        ctx.reply(`Encantado, ${ctx.message.text}. ¿Tu **teléfono**?`);
        return ctx.wizard.next();
    },
    (ctx) => {
        ctx.wizard.state.formData.telefono = ctx.message.text;
        ctx.reply('¿Qué diseño tienes en mente?');
        return ctx.wizard.next();
    },
    (ctx) => {
        ctx.wizard.state.formData.idea = ctx.message.text;
        ctx.reply('¿Qué estilo?', Markup.keyboard([['Realismo', 'Fine Line'], ['Tradicional', 'Blackwork'], ['Minimalista', 'Otro']]).oneTime().resize());
        return ctx.wizard.next();
    },
    (ctx) => {
        ctx.wizard.state.formData.estilo = ctx.message.text;
        ctx.reply('¿Zona y tamaño (cm)?', Markup.removeKeyboard());
        return ctx.wizard.next();
    },
    (ctx) => {
        ctx.wizard.state.formData.detalles = ctx.message.text;
        ctx.reply('Envíame una foto o pulsa el botón:', Markup.keyboard([['❌ No tengo foto']]).oneTime().resize());
        return ctx.wizard.next();
    },
    async (ctx) => {
        const d = ctx.wizard.state.formData;
        let tieneFoto = false, photoId = null;

        if (ctx.message.photo) {
            photoId = ctx.message.photo[ctx.message.photo.length - 1].file_id;
            tieneFoto = true;
        } else if (ctx.message.text === '❌ No tengo foto') {
            tieneFoto = false;
        } else {
            return ctx.reply('Envía una foto o pulsa el botón.');
        }

        await ctx.reply('¡Ficha enviada! El artista te dará el precio pronto. 🔥', Markup.removeKeyboard());

        const numWA = d.telefono.replace(/\D/g, '');
        const fichaTatuador = `🖋️ **NUEVA SOLICITUD**\n----------------------------------\n👤: ${d.nombre} (${d.user})\n📞: ${d.telefono}\n💡: ${d.idea}\n🎨: ${d.estilo}\n📍: ${d.detalles}\n🖼️: ${tieneFoto ? 'Si' : 'No'}\n----------------------------------`;

        await ctx.telegram.sendMessage(MI_ID, fichaTatuador, {
            parse_mode: 'Markdown',
            ...Markup.inlineKeyboard([[Markup.button.url('💬 Abrir WhatsApp', `https://wa.me/${numWA}`)]])
        });

        if (tieneFoto) await ctx.telegram.sendPhoto(MI_ID, photoId);

        setTimeout(() => irAlMenuPrincipal(ctx), 2000);
        return ctx.scene.leave();
    }
);

// --- MENÚ PRINCIPAL ---
function irAlMenuPrincipal(ctx) {
    return ctx.reply(
        'Bienvenido a Spicy Inkk 🖋️\n¿En qué puedo ayudarte?',
        Markup.keyboard([['🔥 Hablar con SpicyBot', '💡 Consultar Ideas']]).oneTime().resize()
    );
}

const stage = new Scenes.Stage([tattooScene, ideasScene]);
bot.use(session());
bot.use(stage.middleware());

bot.start((ctx) => irAlMenuPrincipal(ctx));
bot.hears('🔥 Hablar con SpicyBot', (ctx) => ctx.scene.enter('tattoo-wizard'));
bot.hears('💡 Consultar Ideas', (ctx) => ctx.scene.enter('ideas-scene'));

bot.launch().then(() => console.log('✅ SpicyBot Blindado y 24/7 operativo.'));

// Manejo de errores para evitar que se caiga
bot.catch((err) => console.error('Error en el bot:', err));
