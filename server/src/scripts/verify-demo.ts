// Read-only checks of the actual MongoDB analytics service after importing historical data.
import mongoose from 'mongoose';
import {env} from '../config/env.js';
import {analytics} from '../services/analytics.js';
import {DEMO_SEED} from '../services/demo-data.js';
try{
  await mongoose.connect(env.MONGODB_URI,{autoCreate:false,autoIndex:false,serverSelectionTimeoutMS:5000});
  const db=mongoose.connection.db!;
  const from=new Date(Date.now()-90*86400000).toISOString().slice(0,10);
  const to=new Date().toISOString().slice(0,10);
  const overview=await analytics({from,to,group:'daily'});
  const orders=await db.collection('orders').find({createdAt:{$gte:new Date(from+'T00:00:00.000Z'),$lte:new Date(to+'T23:59:59.999Z')}}).toArray();
  const eligible=orders.filter(order=>order.paymentStatus==='Paid'&&order.orderStatus!=='Cancelled');
  const revenue=eligible.reduce((sum,order)=>sum+order.totalAmount,0);
  if(overview.metrics.orders!==orders.length||overview.metrics.revenue!==revenue||overview.metrics.averageOrderValue!==(eligible.length?Math.round(revenue/eligible.length):0))throw new Error('Dashboard metrics do not match stored orders.');
  if(overview.series.reduce((sum,point)=>sum+point.revenue,0)!==revenue)throw new Error('Revenue chart does not reconcile.');
  if(overview.statuses.reduce((sum,status)=>sum+status.count,0)!==orders.length)throw new Error('Order status chart does not reconcile.');
  console.log(JSON.stringify({demoProducts:await db.collection('products').countDocuments({demoSeed:DEMO_SEED}),demoOrders:await db.collection('orders').countDocuments({demoSeed:DEMO_SEED}),users:await db.collection('users').countDocuments(),metrics:overview.metrics,chartRevenueReconciles:true,orderStatusChartReconciles:true,categories:overview.categories.length,topProducts:overview.topProducts.length,lowStockAlerts:overview.lowStock.length},null,2));
}finally{await mongoose.disconnect();}
