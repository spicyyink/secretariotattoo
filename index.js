require('dotenv').config(); // 1. CARGA TUS SECRETOS (.env)

const { Telegraf, Scenes, session, Markup } = require('telegraf');
const http = require('http');

// ==========================================
// 2. SERVIDOR PARA MANTENER VIVO (Optimizado para Render)
// ==========================================
const server = http.createServer((req, res) => {
    console.log(`Petición recibida: ${req.url} - Manteniendo bot despierto ⚡`);
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('SpicyBot está online ✅');
});

// Render asigna un puerto automáticamente
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Servidor de salud escuchando en el puerto ${PORT}`);
});

// ==========================================
// 3. CONFIGURACIÓN DEL BOT
// ==========================================
const BOT_TOKEN = process.env.BOT_TOKEN; 
const MI_ID = process.env.MI_ID;

const bot = new Telegraf(BOT_TOKEN);

// --- ESCENA DE IDEAS ---
const ideasScene = new Scenes.WizardScene(
    'ideas-scene',
    (ctx) => {
        ctx.reply(
            '💡 **Modo Ideas**\n¿En qué zona estás pensando?',
            Markup.keyboard([
                ['Rodilla', 'Codo', 'Cuello'],
                ['Tríceps', 'Bíceps', 'Antebrazo'],
                ['⬅️ Volver al Menú']
            ]).oneTime().resize()
        );
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

// --- ESCENA DE PRESUPUESTO (CON TODAS LAS MEJORAS) ---
const tattooScene = new Scenes.WizardScene(
    'tattoo-wizard',
    // 1. Nombre
    (ctx) => {
        ctx.reply('¡Hola! 👋 Soy **SpicyBot**, el asistente de SpicyInkk.\n\n¿Tu **nombre**?', { parse_mode: 'Markdown' });
        ctx.wizard.state.formData = { user: ctx.from.username ? `@${ctx.from.username}` : 'Sin alias' };
        return ctx.wizard.next();
    },
    // 2. Punto 1: Mayoría de edad
    (ctx) => {
        ctx.wizard.state.formData.nombre = ctx.message.text;
        ctx.reply('🔞 ¿Eres mayor de 18 años?', 
            Markup.keyboard([['Sí, soy mayor', 'No']]).oneTime().resize());
        return ctx.wizard.next();
    },
    // 3. Punto 2: Salud (Con botón No lo sé)
    (ctx) => {
        if (ctx.message.text === 'No') {
            ctx.reply('⚠️ Lo siento, es obligatorio ser mayor de edad o contar con autorización legal.');
            return ctx.scene.leave();
        }
        ctx.reply('🏥 ¿Sufres de alergias, epilepsia o tomas medicación?', 
            Markup.keyboard([['No, todo bien'], ['Sí (especificar)', 'No lo sé']]).oneTime().resize());
        return ctx.wizard.next();
    },
    // 4. Teléfono
    (ctx) => {
        ctx.wizard.state.formData.salud = ctx.message.text;
        ctx.reply('¿Tu **teléfono** para contactarte?', Markup.removeKeyboard());
        return ctx.wizard.next();
    },
    // 5. Diseño
    (ctx) => {
        ctx.wizard.state.formData.telefono = ctx.message.text;
        ctx.reply('¿Qué **diseño** tienes en mente?');
        return ctx.wizard.next();
    },
    // 6. Punto 6: Tamaño (Con botón No lo sé)
    (ctx) => {
        ctx.wizard.state.formData.idea = ctx.message.text;
        ctx.reply('📏 ¿Qué tamaño aproximado quieres en cm? (Ancho x Alto)', 
            Markup.keyboard([['No lo sé, que el artista me asesore']]).oneTime().resize());
        return ctx.wizard.next();
    },
    // 7. Punto 7: Estado de la piel
    (ctx) => {
        ctx.wizard.state.formData.tamano = ctx.message.text;
        ctx.reply('🩹 ¿La zona tiene cicatrices, quemaduras o muchos lunares?', 
            Markup.keyboard([['Piel limpia', 'Tengo cicatrices/lunares']]).oneTime().resize());
        return ctx.wizard.next();
    },
    // 8. Punto 10: Preferencia de horario
    (ctx) => {
        ctx.wizard.state.formData.piel = ctx.message.text;
        ctx.reply('🕒 ¿Qué horario prefieres para tu cita?', 
            Markup.keyboard([['Mañanas', 'Tardes'], ['Cualquier horario']]).oneTime().resize());
        return ctx.wizard.next();
    },
    // 9. Foto
    (ctx) => {
        ctx.wizard.state.formData.horario = ctx.message.text;
        ctx.reply('Envíame una foto de referencia o de la zona donde irá el tattoo:', 
            Markup.keyboard([['❌ No tengo foto']]).oneTime().resize());
        return ctx.wizard.next();
    },
    // 10. Envío final al tatuador
    async (ctx) => {
        const d = ctx.wizard.state.formData;
        let photoId = ctx.message.photo ? ctx.message.photo[ctx.message.photo.length - 1].file_id : null;

        await ctx.reply('¡Ficha enviada con éxito! El artista te contactará pronto. 🔥', Markup.removeKeyboard());

        const ficha = `🖋️ **NUEVA SOLICITUD DE TATTOO**\n` +
                      `----------------------------------\n` +
                      `👤 **Nombre:** ${d.nombre} (${d.user})\n` +
                      `🏥 **Salud:** ${d.salud}\n` +
                      `📞 **WhatsApp:** ${d.telefono}\n` +
                      `💡 **Idea:** ${d.idea}\n` +
                      `📏 **Tamaño:** ${d.tamano}\n` +
                      `🩹 **Piel:** ${d.piel}\n` +
                      `🕒 **Horario:** ${d.horario}\n` +
                      `----------------------------------`;

        await ctx.telegram.sendMessage(MI_ID, ficha, {
            parse_mode: 'Markdown',
            ...Markup.inlineKeyboard([[Markup.button.url('💬 Abrir WhatsApp', `https://wa.me/${d.telefono.replace(/\D/g, '')}`)]])
        });

        if (photoId) await ctx.telegram.sendPhoto(MI_ID, photoId);

        setTimeout(() => irAlMenuPrincipal(ctx), 2000);
        return ctx.scene.leave();
    }
);

// --- FUNCIONES DE NAVEGACIÓN ---
function irAlMenuPrincipal(ctx) {
    return ctx.reply(
        'Bienvenido a Spicy Inkk 🖋️\n¿En qué puedo ayudarte?',
        Markup.keyboard([
            ['🔥 Hablar con SpicyBot'],
            ['💡 Consultar Ideas', '🧼 Cuidados']
        ]).oneTime().resize()
    );
}

// --- LÓGICA DE BOTONES EXTERNOS ---
bot.hears('🧼 Cuidados', (ctx) => {
    ctx.reply(
        '✨ **Guía de Cuidados de Spicy Inkk** ✨\n\n' +
        '1. **Limpia:** Lava el tatuaje 3 veces al día con jabón neutro.\n' +
        '2. **Hidrata:** Aplica una capa fina de crema recomendada.\n' +
        '3. **❌ NO:** No rasques, no quites costras y evita el sol/piscinas por 15 días.\n\n' +
        '¡Un tatuaje bien cuidado se ve mucho mejor! 🖋️'
    );
});

// --- INICIO DEL BOT ---
const stage = new Scenes.Stage([tattooScene, ideasScene]);
bot.use(session());
bot.use(stage.middleware());

bot.start((ctx) => irAlMenuPrincipal(ctx));
bot.hears('🔥 Hablar con SpicyBot', (ctx) => ctx.scene.enter('tattoo-wizard'));
bot.hears('💡 Consultar Ideas', (ctx) => ctx.scene.enter('ideas-scene'));

bot.launch().then(() => console.log('✅ SpicyBot Operativo y listo para Render.'));

// Manejo de errores
bot.catch((err) => console.error('Error detectado:', err));
