// Island appearance is isolated from the main gameplay file.
export function drawIslandTerrain({context:g,island:i,x,y,radius,biomeColor,shapeIsland}) {
  shapeIsland(i,x,y);
  g.fillStyle = '#e8d27a';
  g.fill();

  g.save();
  shapeIsland(i,x,y);
  g.clip();
  g.fillStyle = biomeColor;
  g.fillRect(x-radius-2,y-radius-2,radius*2+4,radius*2+4);
  // No random circular speckles: keep land visually clean and readable.
  // Add a subtle darker interior band instead of scattered dots.
  g.globalAlpha = 0.12;
  g.fillStyle = '#163e2a';
  g.beginPath();
  g.ellipse(x,y+radius*0.08,radius*0.66,radius*0.47,0,0,Math.PI*2);
  g.fill();
  g.globalAlpha = 1;
  g.restore();

  g.save();
  shapeIsland(i,x,y);
  g.strokeStyle = 'rgba(255,245,185,.8)';
  g.lineWidth = 5;
  g.stroke();
  g.restore();
}

export function drawIslandTrees({context:g,island:i,x,y,radius,seededRandom,hash}) {
  if (!i.palms || !i.palms.length) {
    const rng = seededRandom(i.seed || hash(i.row.id || i.key || i.row.name));
    const count = i.generated ? 10 + Math.floor(rng()*7) : 5;
    i.palms = [];
    for (let n=0;n<count;n++) {
      const a=rng()*Math.PI*2, d=Math.sqrt(rng())*radius*.72;
      i.palms.push([Math.cos(a)*d,Math.sin(a)*d*.70]);
    }
  }

  // Each tree is a simple trunk and two narrow fronds, avoiding the old dot-like blobs.
  for (const p of i.palms) {
    const tx=x+p[0], ty=y+p[1], scale=i.generated ? 0.78 : 1;
    g.strokeStyle='#76502e';
    g.lineWidth=2.2*scale;
    g.beginPath();
    g.moveTo(tx,ty+5*scale);
    g.lineTo(tx,ty-5*scale);
    g.stroke();
    g.strokeStyle='#276b3d';
    g.lineWidth=3*scale;
    g.lineCap='round';
    g.beginPath();
    g.moveTo(tx,ty-4*scale); g.lineTo(tx-6*scale,ty-7*scale);
    g.moveTo(tx,ty-4*scale); g.lineTo(tx+6*scale,ty-8*scale);
    g.moveTo(tx,ty-4*scale); g.lineTo(tx,ty-10*scale);
    g.stroke();
    g.lineCap='butt';
  }
}
