import { Hono } from "hono";
import healthRouter from "./health";
import catalogRouter from "./catalog";
import authRouter from "./auth";
import customerRouter from "./customer";
import ordersRouter from "./orders";

const router = new Hono();

router.route("/", healthRouter);
router.route("/", catalogRouter);
router.route("/", authRouter);
router.route("/", customerRouter);
router.route("/", ordersRouter);

export default router;
