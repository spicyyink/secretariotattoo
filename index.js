require('dotenv').config();

const { Telegraf, Scenes, session, Markup } = require('telegraf');
const http = require('http');

// ==========================================
// SERVIDOR DE SALUD (Mantiene el bot vivo)
// ==========================================
const server = http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('SpicyBot está online ✅');
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Servidor en puerto ${PORT}`));

// ==========================================
// CONFIGURACIÓN DEL BOT
// ==========================================
const bot = new Telegraf(process.env.BOT_TOKEN);
const MI_ID = process.env.MI_ID;

// --- ESCENA DE IDEAS ---
const ideasScene = new Scenes.WizardScene(
    'ideas-scene',
    (ctx) => {
        ctx.reply('¿En qué zona estás pensando?',
            Markup.keyboard([['Rodilla', 'Codo', 'Cuello'], ['Tríceps', 'Bíceps', 'Antebrazo'], ['⬅️ Volver']]).oneTime().resize());
        return ctx.wizard.next();
    },
    (ctx) => {
        const zona = ctx.message.text ? ctx.message.text.toLowerCase() : '';
        if (zona.includes('volver')) return irAlMenuPrincipal(ctx);
        ctx.reply('🌟 Mi consejo: Para esa zona busca algo que fluya con tu anatomía.');
        setTimeout(() => irAlMenuPrincipal(ctx), 1500);
        return ctx.scene.leave();
    }
);

// --- ESCENA DE PRESUPUESTO (FORMULARIO) ---
const tattooScene = new Scenes.WizardScene(
    'tattoo-wizard',
    (ctx) => {
        ctx.reply('¡Hola! Soy SpicyBot, tu asistente personal.\n\n¿Cómo te llamas?');
        ctx.wizard.state.formData = { user: ctx.from.username ? `@${ctx.from.username}` : 'Sin alias' };
        return ctx.wizard.next();
    },
    (ctx) => {
        ctx.wizard.state.formData.nombre = ctx.message.text;
        // Se añade el botón de +16 años
        ctx.reply('¿Qué edad tienes?', Markup.keyboard([['Sí, soy mayor', '+16 años'], ['Menor de 16']]).oneTime().resize());
        return ctx.wizard.next();
    },
    (ctx) => {
        const respuestaEdad = ctx.message.text;
        
        if (respuestaEdad === 'Menor de 16') {
            ctx.reply('Lo siento, el estudio no realiza tatuajes a menores de 16 años.');
            return ctx.scene.leave();
        }
        
        ctx.wizard.state.formData.edad = respuestaEdad;
        ctx.reply('¿Sufres de alergias o tomas alguna medicación?', 
            Markup.keyboard([['No, todo bien'], ['Sí (especificar)', 'No lo sé']]).oneTime().resize());
        return ctx.wizard.next();
    },
    (ctx) => {
        ctx.wizard.state.formData.salud = ctx.message.text;
        ctx.reply('¿Cuál es tu número de teléfono?', Markup.removeKeyboard());
        return ctx.wizard.next();
    },
    (ctx) => {
        ctx.wizard.state.formData.telefono = ctx.message.text;
        ctx.reply('¿Qué diseño tienes en mente?');
        return ctx.wizard.next();
    },
    (ctx) => {
        ctx.wizard.state.formData.idea = ctx.message.text;
        ctx.reply('¿Qué tamaño aproximado quieres en cm?', 
            Markup.keyboard([['No lo sé, prefiero que me asesores']]).oneTime().resize());
        return ctx.wizard.next();
    },
    (ctx) => {
        ctx.wizard.state.formData.tamano = ctx.message.text;
        ctx.reply('¿Tienes cicatrices o lunares en esa zona?', 
            Markup.keyboard([['Piel limpia', 'Tengo cicatrices/lunares']]).oneTime().resize());
        return ctx.wizard.next();
    },
    (ctx) => {
        ctx.wizard.state.formData.piel = ctx.message.text;
        ctx.reply('¿Qué horario prefieres para tu cita?', 
            Markup.keyboard([['Mañanas', 'Tardes'], ['Cualquier horario']]).oneTime().resize());
        return ctx.wizard.next();
    },
    (ctx) => {
        ctx.wizard.state.formData.horario = ctx.message.text;
        ctx.reply('Envíame una foto de referencia o de la zona:', Markup.keyboard([['❌ No tengo foto']]).oneTime().resize());
        return ctx.wizard.next();
    },
    async (ctx) => {
        const d = ctx.wizard.state.formData;
        let photoId = ctx.message.photo ? ctx.message.photo[ctx.message.photo.length - 1].file_id : null;
        await ctx.reply('¡Ficha enviada! Revisaré tu caso y te contactaré pronto.', Markup.removeKeyboard());

        const ficha = `🖋️ NUEVA SOLICITUD\n\n👤 Nombre: ${d.nombre}\n🔞 Edad: ${d.edad}\n🏥 Salud: ${d.salud}\n📞 WhatsApp: ${d.telefono}\n💡 Idea: ${d.idea}\n📏 Tamaño: ${d.tamano}\n🩹 Piel: ${d.piel}\n🕒 Horario: ${d.horario}`;
        
        await ctx.telegram.sendMessage(MI_ID, ficha, {
            ...Markup.inlineKeyboard([[Markup.button.url('💬 Abrir WhatsApp', `https://wa.me/${d.telefono.replace(/\D/g, '')}`)]])
        });
        if (photoId) await ctx.telegram.sendPhoto(MI_ID, photoId);
        setTimeout(() => irAlMenuPrincipal(ctx), 2000);
        return ctx.scene.leave();
    }
);

// --- MENÚ PRINCIPAL ---
function irAlMenuPrincipal(ctx) {
    return ctx.reply('Bienvenido a Spicy Inkk 🖋️\n¿En qué puedo ayudarte?', 
        Markup.keyboard([
            ['🔥 Hablar con SpicyBot'],
            ['💡 Consultar Ideas', '🧼 Cuidados'],
            ['🎁 Sorteos', '📅 Huecos Libres']
        ]).oneTime().resize());
}

// --- LÓGICA DE BOTONES ---

// Cuidados
bot.hears('🧼 Cuidados', (ctx) => {
    const texto = '✨ **MI GUÍA PROFESIONAL DE CUIDADOS** ✨\n\n' +
        '1. **LAVA**: 3 veces al día con jabón neutro y agua tibia.\n' +
        '2. **SECA**: Siempre con papel de cocina a toques, nunca con toalla.\n' +
        '3. **HIDRATA**: Aplica una capa muy fina de crema específica.\n' +
        '4. **PROHIBIDO**: Sol, piscinas, playa y rascar las costras por 15 días.\n\n' +
        '----------------------------------\n' +
        '✨ **MI RECOMENDACIÓN DE CREMAS** ✨\n\n' +
        '✅ **Aquaphor (Eucerin)**: Mi favorita. Repara la piel sin obstruir el poro.\n' +
        '✅ **Bepanthol Tatuaje**: Opción clásica con provitamina B5.\n' +
        '⚠️ **Nivea**: Úsala con precaución. Prefiero que compres las anteriores para asegurar el mejor acabado.\n\n' +
        'Si tienes dudas o notas inflamación excesiva, escríbeme directamente.';
    ctx.reply(texto, { parse_mode: 'Markdown' });
});

// Sorteos
bot.hears('🎁 Sorteos', (ctx) => {
    ctx.reply(
        '🎉 **MI SORTEO ACTIVO EN TELEGRAM** 🎉\n\n' +
        '¡Estoy de sorteo! No pierdas la oportunidad de participar.\n\n' +
        '📅 **Fechas:** Se celebra del 5 al 10 de febrero de 2026.\n\n' +
        '👉 **Participa aquí:** https://t.me/+bAbJXSaI4rE0YzM0\n\n' +
        '¡Mucha suerte! 🖋️', 
        { parse_mode: 'Markdown' }
    );
});

// Cancelaciones
bot.hears('📅 Huecos Libres', (ctx) => {
    ctx.reply('⚡ **AVISO DE CANCELACIONES** ⚡\n\n¿Quieres un tatuaje pronto? Cuando tengo cancelaciones de última hora, publico los huecos en mis Stories de Instagram.\n\nSi quieres que te avise personalmente, dímelo al rellenar tu ficha en "Hablar con SpicyBot".', { parse_mode: 'Markdown' });
});

// --- INICIO ---
const stage = new Scenes.Stage([tattooScene, ideasScene]);
bot.use(session());
bot.use(stage.middleware());

bot.start((ctx) => irAlMenuPrincipal(ctx));
bot.hears('🔥 Hablar con SpicyBot', (ctx) => ctx.scene.enter('tattoo-wizard'));
bot.hears('💡 Consultar Ideas', (ctx) => ctx.scene.enter('ideas-scene'));

bot.launch().then(() => console.log('✅ SpicyBot Operativo'));
bot.catch((err) => console.error(err));
