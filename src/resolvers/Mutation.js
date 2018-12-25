const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
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
    },
    async signup(parent, args, ctx, info) {
        args.email = args.email.toLowerCase();
        // hash their email
        const password = await bcrypt.hash(args.password, 10);
        // create the user in a db
        const user = await ctx.db.mutation.createUser({
            data: {
                ...args,
                password,
                permission: { set: ['USER'] }
            }
        }, info);
        // create JWT token for them
        const token = jwt.sign({ userId: user.id }, process.env.APP_SECRET);
        // set JWT as a cookie on the response
        ctx.response.cookie('token', token, {
            httpOnly: true,
            maxAge: 1000 * 60 * 60 * 24 * 30
        })
        return user;
    }
};

module.exports = Mutations;
