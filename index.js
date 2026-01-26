bot.action('admin_usuarios', async (ctx) => {
    // 1. Recopilamos IDs de todos los sitios (fichas y puntos) para no perder a nadie
    const ids = [...new Set([...Object.keys(db.puntos), ...Object.keys(db.fichas)])];

    if (ids.length === 0) {
        return ctx.answerCbQuery("❌ No hay usuarios registrados aún.");
    }

    let lista = "👥 **LISTADO DE USUARIOS**\n━━━━━━━━━━━━━━━━━━━━\n\n";

    ids.forEach(id => {
        // Intentamos sacar el nombre de la ficha. Si no rellenó ficha, ponemos "Sin Nombre"
        const nombre = db.fichas[id] && db.fichas[id].nombre 
            ? db.fichas[id].nombre 
            : "Usuario (Sin Ficha)";
            
        // Formato para copiar y pegar fácil
        lista += `👤 **Nombre:** ${nombre}\n🆔 **ID:** \`${id}\`\n─────────────────\n`;
    });

    // 2. Enviamos un mensaje NUEVO (no editamos) para que puedas ver toda la lista
    await ctx.answerCbQuery(); // Quita el relojito de carga del botón
    return ctx.reply(lista, { parse_mode: 'Markdown' });
});
