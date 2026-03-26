import React, { useMemo, useState } from "react";
import { motion } from "framer-motion";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Slider } from "@/components/ui/slider";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";

function fmt(x: number, digits = 3) {
  if (!Number.isFinite(x)) return "NaN";
  const y = Math.abs(x) < 1e-12 ? 0 : x;
  return y.toFixed(digits);
}

function det2(m: number[][]) {
  return m[0][0] * m[1][1] - m[0][1] * m[1][0];
}

function mul2(a: number[][], b: number[][]) {
  return [
    [a[0][0] * b[0][0] + a[0][1] * b[1][0], a[0][0] * b[0][1] + a[0][1] * b[1][1]],
    [a[1][0] * b[0][0] + a[1][1] * b[1][0], a[1][0] * b[0][1] + a[1][1] * b[1][1]],
  ];
}

function transpose2(a: number[][]) {
  return [
    [a[0][0], a[1][0]],
    [a[0][1], a[1][1]],
  ];
}

function sub2(a: number[][], b: number[][]) {
  return [
    [a[0][0] - b[0][0], a[0][1] - b[0][1]],
    [a[1][0] - b[1][0], a[1][1] - b[1][1]],
  ];
}

function frob2(a: number[][]) {
  return Math.sqrt(a[0][0] ** 2 + a[0][1] ** 2 + a[1][0] ** 2 + a[1][1] ** 2);
}

function cholesky2(omega: number[][]) {
  const a = omega[0][0];
  const b = omega[0][1];
  const c = omega[1][1];

  if (a <= 0) return null;
  const l11 = Math.sqrt(a);
  const l21 = b / l11;
  const rem = c - l21 * l21;
  if (rem <= 0) return null;
  const l22 = Math.sqrt(rem);

  return [
    [l11, 0],
    [l21, l22],
  ];
}

function rotation(thetaDeg: number, reflect: boolean) {
  const t = (thetaDeg * Math.PI) / 180;
  const c = Math.cos(t);
  const s = Math.sin(t);
  const r = [
    [c, -s],
    [s, c],
  ];
  if (!reflect) return r;
  const f = [
    [1, 0],
    [0, -1],
  ];
  return mul2(r, f);
}

function MatrixView({ title, m }: { title: string; m: number[][] }) {
  return (
    <div className="space-y-2">
      <div className="text-sm font-medium">{title}</div>
      <div className="rounded-2xl border p-3 font-mono text-sm">
        <div>[ {fmt(m[0][0])}   {fmt(m[0][1])} ]</div>
        <div>[ {fmt(m[1][0])}   {fmt(m[1][1])} ]</div>
      </div>
    </div>
  );
}

function VectorArrow({ x, y, color, label, scale }: { x: number; y: number; color: string; label: string; scale: number }) {
  const sx = 180;
  const sy = 180;
  const ex = sx + x * scale;
  const ey = sy - y * scale;
  const dx = ex - sx;
  const dy = ey - sy;
  const len = Math.sqrt(dx * dx + dy * dy) || 1;
  const ux = dx / len;
  const uy = dy / len;
  const ah = 10;
  const aw = 6;
  const leftX = ex - ah * ux + aw * uy;
  const leftY = ey - ah * uy - aw * ux;
  const rightX = ex - ah * ux - aw * uy;
  const rightY = ey - ah * uy + aw * ux;

  return (
    <g>
      <line x1={sx} y1={sy} x2={ex} y2={ey} stroke={color} strokeWidth="3" />
      <polygon points={`${ex},${ey} ${leftX},${leftY} ${rightX},${rightY}`} fill={color} />
      <circle cx={ex} cy={ey} r="3" fill={color} />
      <text x={ex + 8} y={ey - 8} fontSize="12" fill={color}>{label}</text>
    </g>
  );
}

export default function RotationWidget() {
  const [o11, setO11] = useState("1.00");
  const [o12, setO12] = useState("0.50");
  const [o22, setO22] = useState("1.50");
  const [theta, setTheta] = useState([30]);
  const [reflect, setReflect] = useState(false);

  const omega = useMemo(() => {
    const a = Number(o11);
    const b = Number(o12);
    const c = Number(o22);
    return [
      [a, b],
      [b, c],
    ];
  }, [o11, o12, o22]);

  const P = useMemo(() => cholesky2(omega), [omega]);
  const U = useMemo(() => rotation(theta[0], reflect), [theta, reflect]);
  const B = useMemo(() => (P ? mul2(P, U) : null), [P, U]);
  const recovered = useMemo(() => (B ? mul2(B, transpose2(B)) : null), [B]);
  const residual = useMemo(() => (recovered ? frob2(sub2(recovered, omega)) : NaN), [recovered, omega]);
  const positiveDefinite = useMemo(() => omega[0][0] > 0 && det2(omega) > 0, [omega]);

  const vectors = useMemo(() => {
    if (!P || !B) return null;
    return {
      p1: [P[0][0], P[1][0]],
      p2: [P[0][1], P[1][1]],
      b1: [B[0][0], B[1][0]],
      b2: [B[0][1], B[1][1]],
    };
  }, [P, B]);

  const maxCoord = useMemo(() => {
    if (!vectors) return 2;
    const vals = [
      ...vectors.p1,
      ...vectors.p2,
      ...vectors.b1,
      ...vectors.b2,
    ].map((x) => Math.abs(x));
    return Math.max(2, ...vals);
  }, [vectors]);

  const scale = 120 / maxCoord;

  return (
    <div className="mx-auto max-w-6xl p-6">
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35 }}
        className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]"
      >
        <Card className="rounded-2xl shadow-sm">
          <CardHeader>
            <CardTitle>Rotation of impact matrices for a fixed covariance matrix Ω</CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="grid gap-4 sm:grid-cols-3">
              <div className="space-y-2">
                <Label htmlFor="o11">Ω₁₁</Label>
                <Input id="o11" value={o11} onChange={(e) => setO11(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="o12">Ω₁₂ = Ω₂₁</Label>
                <Input id="o12" value={o12} onChange={(e) => setO12(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="o22">Ω₂₂</Label>
                <Input id="o22" value={o22} onChange={(e) => setO22(e.target.value)} />
              </div>
            </div>

            <div className="space-y-3">
              <div className="flex items-center justify-between text-sm">
                <span>Rotation angle θ</span>
                <span className="font-mono">{theta[0].toFixed(0)}°</span>
              </div>
              <Slider value={theta} onValueChange={setTheta} min={-180} max={180} step={1} />
            </div>

            <label className="flex items-center gap-3 text-sm">
              <input
                type="checkbox"
                checked={reflect}
                onChange={(e) => setReflect(e.target.checked)}
                className="h-4 w-4"
              />
              Include reflection so that U ∈ O(2) rather than only SO(2)
            </label>

            {!positiveDefinite || !P ? (
              <Alert>
                <AlertDescription>
                  The entered matrix is not symmetric positive definite, so Cholesky fails. In 2D you need Ω₁₁ > 0 and det(Ω) > 0.
                </AlertDescription>
              </Alert>
            ) : (
              <>
                <div className="grid gap-4 lg:grid-cols-[0.9fr_1.1fr] items-start">
                  <div className="rounded-2xl border p-3">
                    <svg viewBox="0 0 300 300" className="w-full max-w-[360px] rounded-xl bg-white mx-auto">
                      <defs>
                        <pattern id="smallGrid" width="20" height="20" patternUnits="userSpaceOnUse">
                          <path d="M 20 0 L 0 0 0 20" fill="none" stroke="currentColor" strokeWidth="0.3" className="text-gray-200" />
                        </pattern>
                      </defs>
                      <rect x="0" y="0" width="300" height="300" fill="url(#smallGrid)" />
                      <line x1="20" y1="150" x2="280" y2="150" stroke="black" strokeWidth="1" />
                      <line x1="150" y1="20" x2="150" y2="280" stroke="black" strokeWidth="1" />
                      <text x="284" y="144" fontSize="12">x</text>
                      <text x="156" y="18" fontSize="12">y</text>

                      {vectors && (
                        <>
                          <g transform="translate(-30,-30)">
                            <VectorArrow x={vectors.p1[0]} y={vectors.p1[1]} color="#2563eb" label="p₁" scale={scale} />
                            <VectorArrow x={vectors.p2[0]} y={vectors.p2[1]} color="#1d4ed8" label="p₂" scale={scale} />
                            <VectorArrow x={vectors.b1[0]} y={vectors.b1[1]} color="#dc2626" label="b₁" scale={scale} />
                            <VectorArrow x={vectors.b2[0]} y={vectors.b2[1]} color="#b91c1c" label="b₂" scale={scale} />
                          </g>
                        </>
                      )}
                    </svg>
                    <div className="mt-3 grid gap-2 text-sm sm:grid-cols-2">
                      <div><span className="inline-block h-3 w-3 rounded-full bg-blue-600 align-middle" /> <span className="ml-2">Columns of P</span></div>
                      <div><span className="inline-block h-3 w-3 rounded-full bg-red-600 align-middle" /> <span className="ml-2">Columns of B = PU</span></div>
                    </div>
                  </div>

                  <div className="grid gap-4 md:grid-cols-2">
                    <MatrixView title="Ω" m={omega} />
                    <MatrixView title="U" m={U} />
                    <MatrixView title="P from Cholesky, Ω = PP'" m={P} />
                    <MatrixView title="B = PU" m={B} />
                  </div>
                </div>

                {recovered && (
                  <div className="grid gap-4 md:grid-cols-2">
                    <MatrixView title="BB'" m={recovered} />
                    <div className="space-y-2 rounded-2xl border p-4 text-sm">
                      <div className="font-medium">Consistency check</div>
                      <div className="font-mono">||BB' - Ω||_F = {fmt(residual, 8)}</div>
                      <div className="text-muted-foreground">
                        Numerical noise aside, this should be essentially zero. Changing U rotates the impact matrix B = PU, but the product BB' stays equal to Ω.
                      </div>
                    </div>
                  </div>
                )}
              </>
            )}
          </CardContent>
        </Card>

        <Card className="rounded-2xl shadow-sm">
          <CardHeader>
            <CardTitle>What this shows</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 text-sm leading-6">
            <p>
              Start from a fixed symmetric positive definite covariance matrix Ω. Its Cholesky factor P satisfies Ω = PP'.
            </p>
            <p>
              For any orthonormal matrix U, define B = PU. Then BB' = PUU'P' = PP' = Ω.
            </p>
            <p>
              So changing U changes the impact matrix B, but not the covariance matrix Ω. That is the rotation problem in two dimensions, minus the decorative fog.
            </p>
            <p>
              In the figure, the blue arrows are the columns of P, while the red arrows are the columns of B = PU. Move θ and watch B rotate while Ω stays fixed.
            </p>
            <p>
              Ticking the reflection box extends the admissible set from pure rotations SO(2) to all orthonormal matrices O(2).
            </p>
          </CardContent>
        </Card>
      </motion.div>
    </div>
  );
}
