const Mutations = {
    async createItem(parent, args, ctx, info) {
        // TODO: Check if they are logged in

        const item = await ctx.db.mutation.createItem({
            data: { ...args }
        }, info);
        return item;
    },
    async deleteItem(parent, args, ctx, info) {
        const where = {id: args.id};
        // 1: find the item
        const item = await ctx.db.query.item({where}, `{ id, title }`);
        // 2: Check if they have permission to delete
        // TODO
        // 3: Delete it

        return ctx.db.mutation.deleteItem({ where }, info);
    },
    async updateItem(parent, args, ctx, info) {
        // first take a copy of the updates;
        const updates = { ...args };
        // remove the ID from updates
        delete updates.id;
        // run the update
        return ctx.db.mutation.updateItem({
            data: updates,
            where: { id: args.id }
        }, info);
    }
};

module.exports = Mutations;
