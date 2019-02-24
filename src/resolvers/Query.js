const { forwardTo } = require('prisma-binding');
const { hasPermission } = require('../utils');
const Query = {
    me(parent, args, ctx, info) {
        // check if there is a user with the userId
        if (!ctx.request.userId) return null;
        return ctx.db.query.user({
            where: {id: ctx.request.userId}
        }, info);
    },
    items: forwardTo('db'),
    item: forwardTo('db'),
    itemsConnection: forwardTo('db'),
    async users(parent, args, ctx, info) {
        // 1. Check if they are logged in
        if(!ctx.request.userId) {
            throw new Error('You must be logged in!');
        }
        // 2. Check if the user has permission to query all users
        hasPermission(ctx.request.user, ['ADMIN', 'PERMISSIONUPDATE']);

        // 3. if they do, query all the users
        return ctx.db.query.users({}, info);
    },
    async order(parent, args, ctx, info) {
        // 1. Check if they are logged in
        if (!ctx.request.userId) {
            throw new Error('You must be logged in!');
        }
        // 2. Query the order
        const order = await ctx.db.query.order({where: {id: args.id}}, info);
        // 3. Check if they own the order and has permission to see it
        const ownsOrder = order.user.id === ctx.request.userId;
        const hasPermission = ctx.request.user.permissions.includes('ADMIN');
        if (!ownsOrder && !hasPermission) {
            throw new Error('You cannot see this page');
        }
        // 4. Return the order
        return order;
    },
    async orders(parent, args, ctx, info) {
        // 1. Check if they are logged in
        if (!ctx.request.userId) {
            throw new Error('You must be logged in!');
        }
        return ctx.db.query.orders({
            where: {
                user: { id: ctx.request.userId }
            }
        }, info)
    },
};

module.exports = Query;
