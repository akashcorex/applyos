'use client';

import { useState } from 'react';
import { Linkedin } from 'lucide-react';

import { authClient } from '@/lib/auth-client';
import { Button } from '@org/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@org/ui/card';
import { Badge } from '@org/ui/badge';

export function LinkedInConnectCard() {
  const [linking, setLinking] = useState(false);

  async function handleConnect() {
    setLinking(true);
    await authClient.signIn.social({
      provider: 'linkedin',
      callbackURL: '/dashboard',
    });
    setLinking(false);
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="text-lg">LinkedIn</CardTitle>
        <Badge variant="outline" className="bg-blue-100 text-blue-800 border-blue-300">
          OAuth
        </Badge>
      </CardHeader>
      <CardContent>
        <p className="text-sm text-muted-foreground mb-4">
          Connect your LinkedIn account to enable automated job applications and
          outreach.
        </p>
        <Button
          onClick={handleConnect}
          disabled={linking}
          className="w-full"
          variant="outline"
        >
          <Linkedin className="h-4 w-4" />
          {linking ? 'Connecting...' : 'Connect LinkedIn'}
        </Button>
      </CardContent>
    </Card>
  );
}
